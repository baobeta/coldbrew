import { nanoid } from 'nanoid';
import type { TreeNode } from '@/shared/types';
import { BackupError, base64ToBytes, type BackupFile, type BackupNode } from './backupFormat';
import { forEachLimited, PAGE_CONCURRENCY, type BackupOptions } from './exportBackup';
import type { PageSession } from './pageSession';
import { writeText } from './textContent';

export const RESTORED_PREFIX = 'Restored';

type PageNode = Extract<BackupNode, { type: 'page' }>;

interface RestoreOptions extends BackupOptions {
  open: (pageId: string) => Promise<PageSession>;
  commit: (title: string, nodes: TreeNode[]) => void;
}

// Every page gets a new id. Applying old Yjs state to a live page would merge, not roll back.
function assignIds(nodes: BackupNode[], pages: Map<string, PageNode>): TreeNode[] {
  return nodes.map((node) => {
    const id = nanoid(8);
    if (node.type === 'folder') {
      return {
        id,
        type: 'folder',
        title: node.title,
        children: assignIds(node.children, pages),
      };
    }
    pages.set(id, node);
    return { id, type: 'page', kind: node.kind, title: node.title };
  });
}

function writePage(page: PageNode, session: PageSession): void {
  if (page.kind === 'text') {
    writeText(session.fragment, page.content);
    return;
  }
  session.strokes.push(
    page.strokes.map((stroke) => ({ ...stroke, id: nanoid(8), pts: base64ToBytes(stroke.pts) })),
  );
}

export function countNodes(nodes: BackupNode[]): { pages: number; folders: number } {
  const counts = { pages: 0, folders: 0 };
  const visit = (node: BackupNode) => {
    if (node.type === 'folder') {
      counts.folders++;
      node.children.forEach(visit);
    } else {
      counts.pages++;
    }
  };
  nodes.forEach(visit);
  return counts;
}

// The tree changes last, so a failed restore shows nothing and leaves existing pages alone.
export async function restoreBackup(
  backup: Pick<BackupFile, 'exportedAt' | 'nodes'>,
  { open, commit, onProgress, signal }: RestoreOptions,
): Promise<void> {
  const pages = new Map<string, PageNode>();
  const restored = assignIds(backup.nodes, pages);
  const failed: string[] = [];
  let done = 0;

  await forEachLimited(
    [...pages],
    PAGE_CONCURRENCY,
    async ([id, page]) => {
      if (failed.length) return;
      try {
        const session = await open(id);
        try {
          writePage(page, session);
          await session.confirmSaved();
        } finally {
          session.close();
        }
      } catch (error) {
        console.error(`Could not restore page ${page.title}:`, error);
        failed.push(page.title);
      }
      onProgress?.(++done, pages.size);
    },
    signal,
  );

  if (failed.length) {
    throw new BackupError(`Nothing was restored. These pages failed: ${failed.join(', ')}`);
  }
  commit(`${RESTORED_PREFIX} ${backup.exportedAt.slice(0, 10)}`, restored);
}
