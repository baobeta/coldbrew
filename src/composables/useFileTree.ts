import { ref, reactive, onUnmounted } from 'vue';
import * as Y from 'yjs';
import { nanoid } from 'nanoid';
import type { TreeNode } from '@/types';

/**
 * Approach C: Flat node map + ordered children arrays
 *
 * Y.Map('nodes') — flat map of all nodes keyed by ID. Each node is a Y.Map:
 *   { id, type ('page'|'folder'), title, parentId (string|null) }
 *
 * Y.Array('rootChildren') — ordered IDs of top-level nodes
 *
 * For folder nodes, a separate Y.Array is stored at `ydoc.getArray('children:' + nodeId)`
 * This avoids nesting Y.Array inside Y.Map (which prevents moves).
 */

function updateHashPage(pageId: string | null): void {
  const hash = window.location.hash;
  const hasPage = /page=[a-zA-Z0-9_-]+/.test(hash);
  if (pageId) {
    window.location.hash = hasPage
      ? hash.replace(/page=[a-zA-Z0-9_-]+/, `page=${pageId}`)
      : `${hash}&page=${pageId}`;
  } else if (hasPage) {
    window.location.hash = hash.replace(/&?page=[a-zA-Z0-9_-]+/, '');
  }
}

export function useFileTree(
  ydoc: Y.Doc,
  provider: { awareness: any; on: (event: string, cb: (data: any) => void) => void },
  initialPageId: string | null = null,
) {
  const tree = ref<TreeNode[]>([]);
  const activePageId = ref<string | null>(null);
  const expandedFolders = ref<Set<string>>(new Set());

  const nodesMap: Y.Map<Y.Map<any>> = ydoc.getMap('nodes');
  const rootChildren: Y.Array<string> = ydoc.getArray('rootChildren');
  const __stats = { buildCount: 0, syncCount: 0 };
  const nodeCache = new Map<string, TreeNode>();

  function getChildrenArray(folderId: string): Y.Array<string> {
    return ydoc.getArray(`children:${folderId}`);
  }

  function getParentArray(parentId: string | null): Y.Array<string> {
    return parentId ? getChildrenArray(parentId) : rootChildren;
  }

  function buildTreeNode(nodeId: string): TreeNode | null {
    __stats.buildCount++;
    const nodeMap = nodesMap.get(nodeId);
    if (!nodeMap) return null;

    const node: TreeNode = reactive({
      id: nodeMap.get('id') as string,
      type: nodeMap.get('type') as 'page' | 'folder',
      title: nodeMap.get('title') as string,
    }) as TreeNode;

    if (node.type === 'folder') {
      const childArr = getChildrenArray(nodeId);
      node.children = childArr.toArray().map(buildTreeNode).filter(Boolean) as TreeNode[];
    }

    nodeCache.set(nodeId, node);
    return node;
  }

  function syncTree(): void {
    __stats.syncCount++;
    nodeCache.clear();
    tree.value = rootChildren.toArray().map(buildTreeNode).filter(Boolean) as TreeNode[];
  }

  let syncScheduled = false;
  function scheduleSync(): void {
    if (syncScheduled) return;
    syncScheduled = true;
    const run = () => {
      syncScheduled = false;
      syncTree();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else queueMicrotask(run);
  }

  function createPage(title = 'Untitled', parentId: string | null = null): string {
    const id = nanoid(8);

    ydoc.transact(() => {
      const nodeMap = new Y.Map();
      nodeMap.set('id', id);
      nodeMap.set('type', 'page');
      nodeMap.set('title', title);
      nodeMap.set('parentId', parentId);
      nodesMap.set(id, nodeMap);

      ydoc.getXmlFragment(`page-${id}`);
      getParentArray(parentId).push([id]);
    });

    setActivePage(id);
    return id;
  }

  function createFolder(title = 'New Folder', parentId: string | null = null): string {
    const id = nanoid(8);

    ydoc.transact(() => {
      const nodeMap = new Y.Map();
      nodeMap.set('id', id);
      nodeMap.set('type', 'folder');
      nodeMap.set('title', title);
      nodeMap.set('parentId', parentId);
      nodesMap.set(id, nodeMap);

      getParentArray(parentId).push([id]);
    });

    expandedFolders.value = new Set([...expandedFolders.value, id]);
    return id;
  }

  function rename(id: string, newTitle: string): void {
    const nodeMap = nodesMap.get(id);
    if (nodeMap) nodeMap.set('title', newTitle);
  }

  function removeFromParent(nodeId: string): void {
    const nodeMap = nodesMap.get(nodeId);
    if (!nodeMap) return;
    const parentId = nodeMap.get('parentId') as string | null;
    const parentArr = getParentArray(parentId);
    const arr = parentArr.toArray();
    const idx = arr.indexOf(nodeId);
    if (idx >= 0) parentArr.delete(idx, 1);
  }

  function deleteNode(id: string): void {
    const nodeMap = nodesMap.get(id);
    if (!nodeMap) return;

    ydoc.transact(() => {
      if (nodeMap.get('type') === 'folder') {
        const childArr = getChildrenArray(id);
        const childIds = childArr.toArray().slice();
        for (const childId of childIds) {
          deleteNode(childId);
        }
      }

      removeFromParent(id);
      nodesMap.delete(id);
    });

    if (activePageId.value === id) {
      const firstPage = findFirstPage();
      activePageId.value = firstPage;
      broadcastActivePage(firstPage);
      updateHashPage(firstPage);
    }
  }

  function moveNode(nodeId: string, newParentId: string | null, index = -1): void {
    const nodeMap = nodesMap.get(nodeId);
    if (!nodeMap) return;
    if (newParentId === nodeId) return;
    if (newParentId && isDescendant(newParentId, nodeId)) return;

    ydoc.transact(() => {
      removeFromParent(nodeId);
      nodeMap.set('parentId', newParentId);

      const targetArr = getParentArray(newParentId);
      const insertAt = index >= 0 ? Math.min(index, targetArr.length) : targetArr.length;
      targetArr.insert(insertAt, [nodeId]);
    });
  }

  function isDescendant(candidateId: string, ancestorId: string): boolean {
    const childArr = getChildrenArray(ancestorId);
    for (const childId of childArr.toArray()) {
      if (childId === candidateId) return true;
      const childNode = nodesMap.get(childId);
      if (childNode?.get('type') === 'folder' && isDescendant(candidateId, childId)) {
        return true;
      }
    }
    return false;
  }

  function findFirstPage(): string | null {
    function search(arr: Y.Array<string>): string | null {
      for (const id of arr.toArray()) {
        const nodeMap = nodesMap.get(id);
        if (!nodeMap) continue;
        if (nodeMap.get('type') === 'page') return id;
        if (nodeMap.get('type') === 'folder') {
          const found = search(getChildrenArray(id));
          if (found) return found;
        }
      }
      return null;
    }
    return search(rootChildren);
  }

  function expandAncestors(nodeId: string): void {
    const folders: string[] = [];
    let currentId: string | null = nodeId;
    while (currentId) {
      const nodeMap = nodesMap.get(currentId);
      if (!nodeMap) break;
      const parentId = nodeMap.get('parentId') as string | null;
      if (parentId) folders.push(parentId);
      currentId = parentId;
    }
    if (folders.length) {
      expandedFolders.value = new Set([...expandedFolders.value, ...folders]);
    }
  }

  function setActivePage(id: string): void {
    activePageId.value = id;
    broadcastActivePage(id);
    updateHashPage(id);
    queueMicrotask(() => expandAncestors(id));
  }

  function toggleFolder(id: string): void {
    const s = new Set(expandedFolders.value);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    expandedFolders.value = s;
  }

  function getFragment(id: string): Y.XmlFragment {
    return ydoc.getXmlFragment(`page-${id}`);
  }

  function broadcastActivePage(id: string | null): void {
    provider.awareness.setLocalStateField('activePage', id);
  }

  // Observe changes — use deep observer on nodesMap + observer on rootChildren
  const syncHandler = () => scheduleSync();

  function onNodesDeep(events: Y.YEvent<any>[]): void {
    let structural = false;
    for (const ev of events) {
      // A change to a node's OWN Y.Map fields (target is a child map, not nodesMap itself)
      if (ev instanceof Y.YMapEvent && ev.target !== nodesMap) {
        const changed = ev.target as Y.Map<any>;
        const id = changed.get('id') as string;
        const cached = nodeCache.get(id);
        // Surgical path ONLY for a pure title change on a cached, currently-rendered node
        if (cached && ev.keysChanged.size === 1 && ev.keysChanged.has('title')) {
          cached.title = changed.get('title') as string; // reactive in-place update
          continue;
        }
        structural = true;
      } else {
        // membership change on nodesMap itself (add/remove node), or anything else
        structural = true;
      }
    }
    if (structural) scheduleSync();
  }

  nodesMap.observeDeep(onNodesDeep);
  rootChildren.observe(syncHandler);

  // Also observe all folder children arrays
  const folderObservers = new Map<string, Y.Array<string>>();

  function observeFolderChildren(): void {
    for (const [id, nodeMap] of nodesMap) {
      if (nodeMap.get('type') === 'folder' && !folderObservers.has(id)) {
        const childArr = getChildrenArray(id);
        childArr.observe(syncHandler);
        folderObservers.set(id, childArr);
      }
    }
  }

  nodesMap.observe(() => {
    observeFolderChildren();
    scheduleSync();
  });

  // Initialize
  syncTree();
  observeFolderChildren();

  function pageExists(id: string): boolean {
    const nodeMap = nodesMap.get(id);
    return !!nodeMap && nodeMap.get('type') === 'page';
  }

  function initDefaultPage(): void {
    if (rootChildren.length === 0) {
      createPage('Untitled');
    } else if (!activePageId.value) {
      const targetPage =
        initialPageId && pageExists(initialPageId) ? initialPageId : findFirstPage();
      if (targetPage) {
        activePageId.value = targetPage;
        broadcastActivePage(targetPage);
        updateHashPage(targetPage);
      }
    }
  }

  provider.on('sync', (synced: boolean) => {
    if (synced) initDefaultPage();
  });
  initDefaultPage();

  onUnmounted(() => {
    nodesMap.unobserveDeep(onNodesDeep);
    rootChildren.unobserve(syncHandler);
    for (const [, childArr] of folderObservers) {
      childArr.unobserve(syncHandler);
    }
  });

  return {
    tree,
    activePageId,
    expandedFolders,
    createPage,
    createFolder,
    rename,
    deleteNode,
    moveNode,
    setActivePage,
    toggleFolder,
    getFragment,
    __stats,
  };
}
