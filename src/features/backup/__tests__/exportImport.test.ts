import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { BackupError, MAX_TITLE_LENGTH, bytesToBase64, type BackupNode } from '../backupFormat';
import { exportTree } from '../exportBackup';
import { restoreBackup, RESTORED_PREFIX } from '../importBackup';
import { readText, writeText } from '../textContent';
import { encodePoints, decodePoints } from '@/features/canvas/strokeCodec';
import type { PageSession } from '../pageSession';
import type { StrokeRecord } from '@/features/canvas/types';
import type { TreeNode } from '@/shared/types';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

function createStore() {
  const docs = new Map<string, Y.Doc>();
  const closed: string[] = [];
  const getDoc = (id: string) => {
    if (!docs.has(id)) docs.set(id, new Y.Doc());
    return docs.get(id)!;
  };
  const open = async (id: string): Promise<PageSession> => {
    const ydoc = getDoc(id);
    return {
      fragment: ydoc.getXmlFragment('content'),
      strokes: ydoc.getArray<StrokeRecord>('strokes'),
      confirmSaved: async () => {},
      close: () => closed.push(id),
    };
  };
  return { docs, closed, getDoc, open };
}

const tree: TreeNode[] = [
  {
    id: 'f',
    type: 'folder',
    title: 'Notes',
    children: [{ id: 't', type: 'page', kind: 'text', title: 'Plan' }],
  },
  { id: 'c', type: 'page', kind: 'canvas', title: 'Sketch' },
];

function seed(store: ReturnType<typeof createStore>) {
  writeText(store.getDoc('t').getXmlFragment('content'), doc('Hello'));
  store
    .getDoc('c')
    .getArray<StrokeRecord>('strokes')
    .push([
      {
        id: 's1',
        tool: 'highlighter',
        color: '#dc2626',
        size: 8,
        simulatePressure: true,
        pts: encodePoints([
          [1, 2, 0.5],
          [3, 4, 0.6],
        ]),
      },
    ]);
}

describe('exportTree', () => {
  it('keeps the tree order and reads text and strokes', async () => {
    const store = createStore();
    seed(store);
    const nodes = await exportTree(tree, store.open);
    expect(nodes.map((node) => node.title)).toEqual(['Notes', 'Sketch']);
    const [folder, canvas] = nodes as any[];
    expect(folder.children[0].content).toEqual(doc('Hello'));
    expect(canvas.strokes).toHaveLength(1);
    expect(canvas.strokes[0]).not.toHaveProperty('id');
    expect(new Set(store.closed)).toEqual(new Set(['c', 't']));
  });

  it('gives a never-opened text page valid empty content', async () => {
    const store = createStore();
    const [node] = (await exportTree(
      [{ id: 'n', type: 'page', kind: 'text', title: 'New' }],
      store.open,
    )) as any[];
    expect(node.content).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('reports progress', async () => {
    const store = createStore();
    const onProgress = vi.fn();
    await exportTree(tree, store.open, { onProgress });
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  it('stops and names the page when one cannot load', async () => {
    const store = createStore();
    const open = (id: string) =>
      id === 'c' ? Promise.reject(new Error('timeout')) : store.open(id);
    await expect(exportTree(tree, open)).rejects.toThrow(/Sketch/);
    await expect(exportTree(tree, open)).rejects.toThrow(BackupError);
    expect(store.closed).toContain('t');
  });

  it('names the page when its text cannot be restored', async () => {
    const store = createStore();
    const unsafe = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:x' } }] },
          ],
        },
      ],
    };
    writeText(store.getDoc('t').getXmlFragment('content'), unsafe);
    await expect(exportTree(tree, store.open)).rejects.toThrow(/Plan/);
  });

  it('stops opening pages after the first failure', async () => {
    const pages: TreeNode[] = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      type: 'page',
      kind: 'text',
      title: `Page ${i}`,
    }));
    const open = vi.fn(() => Promise.reject(new Error('server down')));
    await expect(exportTree(pages, open)).rejects.toThrow(BackupError);
    expect(open.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('shortens a very long title instead of making the room unexportable', async () => {
    const store = createStore();
    const [node] = await exportTree(
      [{ id: 'n', type: 'page', kind: 'text', title: 'x'.repeat(MAX_TITLE_LENGTH + 50) }],
      store.open,
    );
    expect(node.title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it('skips a stroke that cannot be decoded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createStore();
    seed(store);
    store
      .getDoc('c')
      .getArray<StrokeRecord>('strokes')
      .push([
        {
          id: 'bad',
          tool: 'pen',
          color: '#000000',
          size: 4,
          simulatePressure: true,
          pts: Uint8Array.from([99]),
        },
      ]);
    const [, canvas] = (await exportTree(tree, store.open)) as any[];
    expect(canvas.strokes).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('waits for running pages before stopping, so no late progress can follow', async () => {
    const store = createStore();
    const controller = new AbortController();
    const onProgress = vi.fn();
    const open = async (id: string) => {
      if (id === 't') {
        await Promise.resolve(); // lets the next worker start its page first
        controller.abort();
        throw new Error('stopped');
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return store.open(id);
    };
    await expect(
      exportTree(tree, open, { onProgress, signal: controller.signal }),
    ).rejects.toThrow();
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('stops when cancelled', async () => {
    const store = createStore();
    const controller = new AbortController();
    controller.abort();
    await expect(exportTree(tree, store.open, { signal: controller.signal })).rejects.toThrow();
  });
});

describe('restoreBackup', () => {
  const nodes: BackupNode[] = [
    {
      type: 'folder',
      title: 'Notes',
      children: [{ type: 'page', kind: 'text', title: 'Plan', content: doc('Hello') }],
    },
    {
      type: 'page',
      kind: 'canvas',
      title: 'Sketch',
      strokes: [
        {
          tool: 'pen',
          color: '#1c1917',
          size: 4,
          simulatePressure: false,
          pts: bytesToBase64(encodePoints([[1, 2, 0.5]])),
        },
      ],
    },
  ];
  const backup = { exportedAt: '2026-11-01T10:00:00.000Z', nodes };

  it('writes pages under new ids, then adds them to the tree', async () => {
    const store = createStore();
    const commit = vi.fn();
    await restoreBackup(backup, { open: store.open, commit });
    expect(commit).toHaveBeenCalledOnce();
    const [title, restored] = commit.mock.calls[0];
    expect(title).toBe(`${RESTORED_PREFIX} 2026-11-01`);
    const pageId = restored[0].children[0].id;
    const canvasId = restored[1].id;
    expect(readText(store.getDoc(pageId).getXmlFragment('content'))).toEqual(doc('Hello'));
    const [stroke] = store.getDoc(canvasId).getArray<StrokeRecord>('strokes').toArray();
    expect(stroke.pts).toBeInstanceOf(Uint8Array);
    expect(decodePoints(stroke.pts)).toHaveLength(1);
    expect(stroke.id).toBeTruthy();
  });

  it('never reuses ids, so restoring twice cannot touch the first copy', async () => {
    const store = createStore();
    const commit = vi.fn();
    await restoreBackup(backup, { open: store.open, commit });
    await restoreBackup(backup, { open: store.open, commit });
    const first = commit.mock.calls[0][1];
    const second = commit.mock.calls[1][1];
    expect(first[1].id).not.toBe(second[1].id);
    expect(store.docs.size).toBe(2 * 2);
  });

  it('adds nothing to the tree when the server does not confirm a page', async () => {
    const store = createStore();
    const commit = vi.fn();
    const open = async (id: string) => ({
      ...(await store.open(id)),
      confirmSaved: () => Promise.reject(new Error('not saved')),
    });
    await expect(restoreBackup(backup, { open, commit })).rejects.toThrow(BackupError);
    expect(commit).not.toHaveBeenCalled();
  });

  it('adds nothing to the tree when cancelled', async () => {
    const store = createStore();
    const commit = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      restoreBackup(backup, { open: store.open, commit, signal: controller.signal }),
    ).rejects.toThrow();
    expect(commit).not.toHaveBeenCalled();
  });

  it('stops writing pages after the first failure', async () => {
    const pages: BackupNode[] = Array.from({ length: 30 }, (_, i) => ({
      type: 'page',
      kind: 'canvas',
      title: `Page ${i}`,
      strokes: [],
    }));
    const open = vi.fn(() => Promise.reject(new Error('server down')));
    const commit = vi.fn();
    await expect(
      restoreBackup({ exportedAt: backup.exportedAt, nodes: pages }, { open, commit }),
    ).rejects.toThrow(BackupError);
    expect(open.mock.calls.length).toBeLessThanOrEqual(3);
    expect(commit).not.toHaveBeenCalled();
  });

  it('closes every session', async () => {
    const store = createStore();
    await restoreBackup(backup, { open: store.open, commit: vi.fn() });
    expect(store.closed).toHaveLength(2);
  });
});
