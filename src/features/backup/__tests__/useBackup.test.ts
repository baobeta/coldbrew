import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import * as Y from 'yjs';
import { useBackup } from '../composables/useBackup';
import { parseBackup } from '../backupFormat';
import type { PageSession } from '../pageSession';
import type { StrokeRecord } from '@/features/canvas/types';
import type { ConnectionStatus, TreeNode } from '@/shared/types';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

const tree: TreeNode[] = [
  {
    id: 'f',
    type: 'folder',
    title: 'My Notes',
    children: [{ id: 'c', type: 'page', kind: 'canvas', title: 'Sketch' }],
  },
];

function setup(status: ConnectionStatus = 'connected') {
  const docs = new Map<string, Y.Doc>();
  const openPage = vi.fn(async (id: string): Promise<PageSession> => {
    if (!docs.has(id)) docs.set(id, new Y.Doc());
    const ydoc = docs.get(id)!;
    return {
      fragment: ydoc.getXmlFragment('content'),
      strokes: ydoc.getArray<StrokeRecord>('strokes'),
      confirmSaved: async () => {},
      close: () => {},
    };
  });
  const download = vi.fn<(text: string, fileName: string) => void>();
  const restoreTree = vi.fn(() => 'restored');
  const backup = useBackup({
    roomId: 'room1',
    tree: ref(tree),
    restoreTree,
    connectionStatus: ref(status),
    openPage,
    download,
  });
  return { backup, openPage, download, restoreTree };
}

describe('useBackup', () => {
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });
  afterEach(() => vi.restoreAllMocks());

  it('exports the room as a file that passes validation', async () => {
    const { backup, download } = setup();
    await backup.exportRoom();
    const [text, fileName] = download.mock.calls[0];
    expect(fileName).toMatch(/^coldbrew-room1-\d{4}-\d{2}-\d{2}\.coldbrew\.json$/);
    expect((await parseBackup(text)).nodes[0].title).toBe('My Notes');
    expect(backup.progress.value).toBe(null);
  });

  it('exports one page and names the file after it', async () => {
    const { backup, download } = setup();
    await backup.exportNode('c');
    const [text, fileName] = download.mock.calls[0];
    expect(fileName).toMatch(/^coldbrew-Sketch-/);
    expect((await parseBackup(text)).nodes.map((node) => node.title)).toEqual(['Sketch']);
  });

  it('refuses to export or import while offline', async () => {
    const { backup, download, openPage, restoreTree } = setup('disconnected');
    await backup.exportRoom();
    expect(backup.error.value).toMatch(/Connect/);
    await backup.importFile(new File(['{}'], 'a.json'));
    expect(download).not.toHaveBeenCalled();
    expect(openPage).not.toHaveBeenCalled();
    expect(restoreTree).not.toHaveBeenCalled();
  });

  it('downloads nothing and names the page when one cannot load', async () => {
    const { backup, download, openPage } = setup();
    openPage.mockRejectedValue(new Error('timeout'));
    await backup.exportRoom();
    expect(download).not.toHaveBeenCalled();
    expect(backup.error.value).toMatch(/Sketch/);
  });

  it('restores a file after confirmation', async () => {
    const first = setup();
    await first.backup.exportRoom();
    const [text] = first.download.mock.calls[0];
    const { backup, restoreTree } = setup();
    await backup.importFile(new File([text], 'a.coldbrew.json'));
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(restoreTree).toHaveBeenCalledOnce();
  });

  it('writes nothing when the person declines', async () => {
    const first = setup();
    await first.backup.exportRoom();
    const [text] = first.download.mock.calls[0];
    vi.mocked(window.confirm).mockReturnValue(false);
    const { backup, openPage, restoreTree } = setup();
    await backup.importFile(new File([text], 'a.coldbrew.json'));
    expect(openPage).not.toHaveBeenCalled();
    expect(restoreTree).not.toHaveBeenCalled();
  });

  it('writes nothing for a bad file and shows why', async () => {
    const { backup, openPage, restoreTree } = setup();
    await backup.importFile(new File(['{"format":"other"}'], 'a.json'));
    expect(backup.error.value).toMatch(/not a Coldbrew/);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(openPage).not.toHaveBeenCalled();
    expect(restoreTree).not.toHaveBeenCalled();
  });

  it('clears the progress bar when a multi-page restore is cancelled', async () => {
    const first = setup();
    await first.backup.exportRoom();
    const file = JSON.parse(first.download.mock.calls[0][0]);
    const { createBackup } = await import('../backupFormat');
    const pages = Array.from({ length: 20 }, () => file.nodes[0].children[0]);
    const text = JSON.stringify(await createBackup(pages, file.exportedAt));

    const { backup, openPage, restoreTree } = setup();
    const realOpen = openPage.getMockImplementation()!;
    let opened = 0;
    openPage.mockImplementation(async (id: string) => {
      if (++opened === 2) backup.cancel();
      const session = await realOpen(id);
      return {
        ...session,
        confirmSaved: () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
      };
    });
    await backup.importFile(new File([text], 'a.coldbrew.json'));
    expect(backup.progress.value).toBe(null);
    expect(backup.error.value).toBe(null);
    expect(restoreTree).not.toHaveBeenCalled();
  });

  it('shows no error after cancelling', async () => {
    const { backup, download, openPage } = setup();
    openPage.mockImplementation(async () => {
      backup.cancel();
      throw new Error('stopped');
    });
    await backup.exportRoom();
    expect(backup.error.value).toBe(null);
    expect(download).not.toHaveBeenCalled();
  });
});
