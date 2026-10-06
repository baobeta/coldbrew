import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import { useFileTree } from '../composables/useFileTree';

// Mock provider with minimal awareness API
function createMockProvider() {
  const localState: Record<string, unknown> = {};
  return {
    awareness: {
      setLocalStateField(key: string, value: unknown) {
        localState[key] = value;
      },
      getStates() {
        return new Map();
      },
      on() {},
    },
    on(_event: string, cb: (data: any) => void) {
      cb(true);
    },
  };
}

// Disable onUnmounted since we're not in a component
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return {
    ...actual,
    onUnmounted: vi.fn(),
  };
});

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

describe('useFileTree', () => {
  let ydoc: Y.Doc;
  let provider: ReturnType<typeof createMockProvider>;
  let fileTree: ReturnType<typeof useFileTree>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    provider = createMockProvider();
    fileTree = useFileTree(ydoc, provider);
  });

  it('creates a default page on empty doc', async () => {
    await frame();
    expect(fileTree.tree.value.length).toBe(1);
    expect(fileTree.tree.value[0].type).toBe('page');
    expect(fileTree.tree.value[0].title).toBe('Untitled');
    expect(fileTree.activePageId.value).toBeTruthy();
  });

  it('creates a page at root', async () => {
    const id = fileTree.createPage('My Page');
    await frame();
    expect(id).toBeTruthy();
    const page = fileTree.tree.value.find((n) => n.id === id)!;
    expect(page).toBeTruthy();
    expect(page.title).toBe('My Page');
    expect(page.type).toBe('page');
  });

  it('creates a folder at root', async () => {
    const id = fileTree.createFolder('My Folder');
    await frame();
    const folder = fileTree.tree.value.find((n) => n.id === id)!;
    expect(folder).toBeTruthy();
    expect(folder.title).toBe('My Folder');
    expect(folder.type).toBe('folder');
    expect(folder.children).toEqual([]);
  });

  it('creates a page inside a folder', async () => {
    const folderId = fileTree.createFolder('Folder');
    const pageId = fileTree.createPage('Nested Page', folderId);
    await frame();
    const folder = fileTree.tree.value.find((n) => n.id === folderId)!;
    expect(folder.children!.length).toBe(1);
    expect(folder.children![0].id).toBe(pageId);
    expect(folder.children![0].title).toBe('Nested Page');
  });

  it('renames a node', async () => {
    const id = fileTree.createPage('Old Name');
    await frame();
    fileTree.rename(id, 'New Name');
    await frame();
    const page = fileTree.tree.value.find((n) => n.id === id)!;
    expect(page.title).toBe('New Name');
  });

  it('deletes a page', async () => {
    const id = fileTree.createPage('To Delete');
    await frame();
    const countBefore = fileTree.tree.value.length;
    fileTree.deleteNode(id);
    await frame();
    expect(fileTree.tree.value.length).toBe(countBefore - 1);
    expect(fileTree.tree.value.find((n) => n.id === id)).toBeUndefined();
  });

  it('deletes a folder and its children', async () => {
    const folderId = fileTree.createFolder('Folder');
    fileTree.createPage('Child 1', folderId);
    fileTree.createPage('Child 2', folderId);
    fileTree.deleteNode(folderId);
    await frame();
    expect(fileTree.tree.value.find((n) => n.id === folderId)).toBeUndefined();
  });

  it('moves a page to a folder', async () => {
    const pageId = fileTree.createPage('Movable');
    const folderId = fileTree.createFolder('Target');
    fileTree.moveNode(pageId, folderId);
    await frame();
    const folder = fileTree.tree.value.find((n) => n.id === folderId)!;
    expect(folder.children!.length).toBe(1);
    expect(folder.children![0].id).toBe(pageId);
    // Should no longer be at root
    expect(fileTree.tree.value.find((n) => n.id === pageId)).toBeUndefined();
  });

  it('prevents moving a folder into its own descendant', async () => {
    const parentId = fileTree.createFolder('Parent');
    const childId = fileTree.createFolder('Child', parentId);
    // Try to move Parent into Child — should be blocked
    fileTree.moveNode(parentId, childId);
    await frame();
    // Parent should still be at root
    expect(fileTree.tree.value.find((n) => n.id === parentId)).toBeTruthy();
  });

  it('toggles folder expansion', () => {
    const folderId = fileTree.createFolder('Folder');
    // Folder is expanded after creation
    expect(fileTree.expandedFolders.value.has(folderId)).toBe(true);
    fileTree.toggleFolder(folderId);
    expect(fileTree.expandedFolders.value.has(folderId)).toBe(false);
    fileTree.toggleFolder(folderId);
    expect(fileTree.expandedFolders.value.has(folderId)).toBe(true);
  });

  it('does not create a page fragment in the tree doc', () => {
    const id = fileTree.createPage('P');
    expect(ydoc.share.has(`page-${id}`)).toBe(false);
  });

  it('sets active page on creation', () => {
    const id = fileTree.createPage('Active');
    expect(fileTree.activePageId.value).toBe(id);
  });
});

describe('useFileTree before provider sync', () => {
  function createDeferredProvider() {
    const syncHandlers: Array<(synced: boolean) => void> = [];
    return {
      awareness: { setLocalStateField() {}, getStates: () => new Map(), on() {} },
      on(event: string, cb: (data: any) => void) {
        if (event === 'sync') syncHandlers.push(cb);
      },
      emitSync() {
        syncHandlers.forEach((cb) => cb(true));
      },
    };
  }

  function seedDocWithPage(title: string): { update: Uint8Array; pageId: string } {
    const remote = new Y.Doc();
    const pageId = 'seed-page';
    const node = new Y.Map();
    remote.transact(() => {
      node.set('id', pageId);
      node.set('type', 'page');
      node.set('title', title);
      node.set('parentId', null);
      remote.getMap('nodes').set(pageId, node);
      remote.getArray('rootChildren').push([pageId]);
    });
    return { update: Y.encodeStateAsUpdate(remote), pageId };
  }

  it('does not create a page before sync, and reuses existing pages once loaded', async () => {
    const ydoc = new Y.Doc();
    const provider = createDeferredProvider();
    const fileTree = useFileTree(ydoc, provider);

    expect(ydoc.getArray('rootChildren').length).toBe(0);

    const { update } = seedDocWithPage('Existing');
    Y.applyUpdate(ydoc, update);
    provider.emitSync();
    await frame();

    expect(fileTree.tree.value.map((n) => n.title)).toEqual(['Existing']);
    expect(fileTree.activePageId.value).toBe(fileTree.tree.value[0].id);
  });

  it('selects the existing page as soon as local state loads, before server sync', () => {
    const ydoc = new Y.Doc();
    const fileTree = useFileTree(ydoc, createDeferredProvider());

    const { update, pageId } = seedDocWithPage('Local');
    Y.applyUpdate(ydoc, update);

    expect(fileTree.activePageId.value).toBe(pageId);
  });

  it('creates a default page only after sync confirms the room is empty', async () => {
    const ydoc = new Y.Doc();
    const provider = createDeferredProvider();
    const fileTree = useFileTree(ydoc, provider);

    provider.emitSync();
    await frame();

    expect(fileTree.tree.value.length).toBe(1);
    expect(fileTree.tree.value[0].title).toBe('Untitled');
  });
});
