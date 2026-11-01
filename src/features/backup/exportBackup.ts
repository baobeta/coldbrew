import { decodePoints } from '@/features/canvas/strokeCodec';
import type { StrokeRecord } from '@/features/canvas/types';
import type { TreeNode } from '@/shared/types';
import {
  BackupError,
  MAX_TITLE_LENGTH,
  bytesToBase64,
  type BackupNode,
  type BackupStroke,
} from './backupFormat';
import type { PageSession } from './pageSession';
import { checkTextContent, readText } from './textContent';

export const PAGE_CONCURRENCY = 3;

export interface BackupOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

type PageContent = { content: unknown } | { strokes: BackupStroke[] };

export async function forEachLimited<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const queue = [...items];
  async function worker(): Promise<void> {
    while (queue.length) {
      signal?.throwIfAborted();
      await task(queue.shift()!);
    }
    signal?.throwIfAborted();
  }
  // Waits for every worker, so a cancelled run can't report progress after it has ended.
  const results = await Promise.allSettled(Array.from({ length: limit }, worker));
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
}

function collectPages(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) =>
    node.type === 'folder' ? collectPages(node.children ?? []) : [node],
  );
}

function toBackupStrokes(records: StrokeRecord[]): BackupStroke[] {
  return records.flatMap(({ tool, color, size, simulatePressure, pts, id }) => {
    try {
      decodePoints(pts);
    } catch (error) {
      console.warn(`Skipping stroke ${id}:`, error);
      return [];
    }
    return [{ tool, color, size, simulatePressure, pts: bytesToBase64(pts) }];
  });
}

function readPage(page: TreeNode, session: PageSession): PageContent {
  if (page.kind === 'canvas') return { strokes: toBackupStrokes(session.strokes.toArray()) };
  const content = readText(session.fragment);
  checkTextContent(content); // here, so a failure can name the page
  return { content };
}

function toBackupNodes(nodes: TreeNode[], contents: Map<string, PageContent>): BackupNode[] {
  return nodes.map((node) => {
    const title = node.title.slice(0, MAX_TITLE_LENGTH);
    if (node.type === 'folder') {
      return {
        type: 'folder',
        title,
        children: toBackupNodes(node.children ?? [], contents),
      };
    }
    const kind = node.kind ?? 'text';
    return { type: 'page', kind, title, ...contents.get(node.id) } as BackupNode;
  });
}

// All or nothing: a partial backup that looks complete is worse than no backup.
export async function exportTree(
  nodes: TreeNode[],
  open: (pageId: string) => Promise<PageSession>,
  { onProgress, signal }: BackupOptions = {},
): Promise<BackupNode[]> {
  const pages = collectPages(nodes);
  const contents = new Map<string, PageContent>();
  const failed: string[] = [];
  let done = 0;

  await forEachLimited(
    pages,
    PAGE_CONCURRENCY,
    async (page) => {
      if (failed.length) return;
      try {
        const session = await open(page.id);
        try {
          contents.set(page.id, readPage(page, session));
        } finally {
          session.close();
        }
      } catch (error) {
        console.error(`Could not load page ${page.id}:`, error);
        failed.push(page.title);
      }
      onProgress?.(++done, pages.length);
    },
    signal,
  );

  if (failed.length) {
    throw new BackupError(`Nothing was saved. These pages could not be read: ${failed.join(', ')}`);
  }
  return toBackupNodes(nodes, contents);
}
