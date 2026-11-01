import { onUnmounted, ref, type Ref } from 'vue';
import type { ConnectionStatus, TreeNode } from '@/shared/types';
import {
  BackupError,
  MAX_BACKUP_BYTES,
  createBackup,
  parseBackup,
  type BackupFile,
} from '../backupFormat';
import { exportTree } from '../exportBackup';
import { countNodes, restoreBackup } from '../importBackup';
import { openPageSession, type PageSession } from '../pageSession';

interface UseBackupOptions {
  roomId: string;
  tree: Ref<TreeNode[]>;
  restoreTree: (title: string, nodes: TreeNode[]) => string;
  connectionStatus: Ref<ConnectionStatus>;
  openPage?: (pageId: string, useLocalData: boolean) => Promise<PageSession>;
  download?: (text: string, fileName: string) => void;
}

function downloadFile(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(label: string): string {
  return label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'backup';
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children ?? [], id);
    if (found) return found;
  }
  return null;
}

export function useBackup({
  roomId,
  tree,
  restoreTree,
  connectionStatus,
  openPage = (pageId, useLocalData) => openPageSession(roomId, pageId, { useLocalData }),
  download = downloadFile,
}: UseBackupOptions) {
  const progress = ref<string | null>(null);
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;

  async function run(task: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (controller) return;
    error.value = null;
    if (connectionStatus.value !== 'connected') {
      error.value = 'Connect to the server first, so the backup can include every page.';
      return;
    }
    const current = new AbortController();
    controller = current;
    progress.value = 'Starting…'; // shows Cancel before the first page finishes
    try {
      await task(current.signal);
    } catch (failure) {
      if (failure instanceof BackupError) {
        error.value = failure.message;
      } else if (!current.signal.aborted) {
        console.error('Backup failed:', failure);
        error.value = 'The backup failed.';
      }
    } finally {
      controller = null;
      progress.value = null;
    }
  }

  async function exportNodes(nodes: TreeNode[], label: string): Promise<void> {
    await run(async (signal) => {
      const backupNodes = await exportTree(nodes, (id) => openPage(id, true), {
        signal,
        onProgress: (done, total) => (progress.value = `Exporting ${done} of ${total}`),
      });
      const exportedAt = new Date().toISOString();
      const text = JSON.stringify(await createBackup(backupNodes, exportedAt));
      // A file that can't be restored must never look like a good backup.
      await parseBackup(text);
      signal.throwIfAborted();
      download(text, `coldbrew-${slug(label)}-${exportedAt.slice(0, 10)}.coldbrew.json`);
    });
  }

  function exportRoom(): Promise<void> {
    return exportNodes(tree.value, roomId);
  }

  function exportNode(id: string): Promise<void> {
    const node = findNode(tree.value, id);
    return node ? exportNodes([node], node.title) : Promise.resolve();
  }

  function confirmRestore(backup: BackupFile): boolean {
    const { pages, folders } = countNodes(backup.nodes);
    const date = new Date(backup.exportedAt).toLocaleDateString();
    return window.confirm(
      `Restore ${pages} pages and ${folders} folders from ${date}?\n\n` +
        'They will be added to a new folder. Existing pages are not changed.',
    );
  }

  async function importFile(file: File): Promise<void> {
    await run(async (signal) => {
      if (file.size > MAX_BACKUP_BYTES) throw new BackupError('The backup file is too large.');
      const backup = await parseBackup(await file.text());
      if (!confirmRestore(backup)) return;
      await restoreBackup(backup, {
        open: (id) => openPage(id, false),
        commit: restoreTree,
        signal,
        onProgress: (done, total) => (progress.value = `Restoring ${done} of ${total}`),
      });
    });
  }

  function cancel(): void {
    controller?.abort();
  }

  function dismissError(): void {
    error.value = null;
  }

  onUnmounted(cancel);

  return { progress, error, exportRoom, exportNode, importFile, cancel, dismissError };
}
