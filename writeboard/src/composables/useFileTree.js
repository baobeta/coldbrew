import { ref, onUnmounted } from 'vue'
import * as Y from 'yjs'
import { nanoid } from 'nanoid'

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

export function useFileTree(ydoc, provider) {
  const tree = ref([])
  const activePageId = ref(null)
  const expandedFolders = ref(new Set())

  const nodesMap = ydoc.getMap('nodes')
  const rootChildren = ydoc.getArray('rootChildren')

  function getChildrenArray(folderId) {
    return ydoc.getArray(`children:${folderId}`)
  }

  function getParentArray(parentId) {
    return parentId ? getChildrenArray(parentId) : rootChildren
  }

  function buildTreeNode(nodeId) {
    const nodeMap = nodesMap.get(nodeId)
    if (!nodeMap) return null

    const node = {
      id: nodeMap.get('id'),
      type: nodeMap.get('type'),
      title: nodeMap.get('title'),
    }

    if (node.type === 'folder') {
      const childArr = getChildrenArray(nodeId)
      node.children = childArr.toArray().map(buildTreeNode).filter(Boolean)
    }

    return node
  }

  function syncTree() {
    tree.value = rootChildren.toArray().map(buildTreeNode).filter(Boolean)
  }

  function createPage(title = 'Untitled', parentId = null) {
    const id = nanoid(8)

    ydoc.transact(() => {
      const nodeMap = new Y.Map()
      nodeMap.set('id', id)
      nodeMap.set('type', 'page')
      nodeMap.set('title', title)
      nodeMap.set('parentId', parentId)
      nodesMap.set(id, nodeMap)

      ydoc.getXmlFragment(`page-${id}`)
      getParentArray(parentId).push([id])
    })

    activePageId.value = id
    broadcastActivePage(id)
    return id
  }

  function createFolder(title = 'New Folder', parentId = null) {
    const id = nanoid(8)

    ydoc.transact(() => {
      const nodeMap = new Y.Map()
      nodeMap.set('id', id)
      nodeMap.set('type', 'folder')
      nodeMap.set('title', title)
      nodeMap.set('parentId', parentId)
      nodesMap.set(id, nodeMap)

      getParentArray(parentId).push([id])
    })

    expandedFolders.value = new Set([...expandedFolders.value, id])
    return id
  }

  function rename(id, newTitle) {
    const nodeMap = nodesMap.get(id)
    if (nodeMap) nodeMap.set('title', newTitle)
  }

  function removeFromParent(nodeId) {
    const nodeMap = nodesMap.get(nodeId)
    if (!nodeMap) return
    const parentId = nodeMap.get('parentId')
    const parentArr = getParentArray(parentId)
    const arr = parentArr.toArray()
    const idx = arr.indexOf(nodeId)
    if (idx >= 0) parentArr.delete(idx, 1)
  }

  function deleteNode(id) {
    const nodeMap = nodesMap.get(id)
    if (!nodeMap) return

    ydoc.transact(() => {
      if (nodeMap.get('type') === 'folder') {
        const childArr = getChildrenArray(id)
        const childIds = childArr.toArray().slice()
        for (const childId of childIds) {
          deleteNode(childId)
        }
      }

      removeFromParent(id)
      nodesMap.delete(id)
    })

    if (activePageId.value === id) {
      const firstPage = findFirstPage()
      activePageId.value = firstPage
      broadcastActivePage(firstPage)
    }
  }

  function moveNode(nodeId, newParentId, index = -1) {
    const nodeMap = nodesMap.get(nodeId)
    if (!nodeMap) return
    if (newParentId === nodeId) return
    if (newParentId && isDescendant(newParentId, nodeId)) return

    ydoc.transact(() => {
      removeFromParent(nodeId)
      nodeMap.set('parentId', newParentId)

      const targetArr = getParentArray(newParentId)
      const insertAt = index >= 0 ? Math.min(index, targetArr.length) : targetArr.length
      targetArr.insert(insertAt, [nodeId])
    })
  }

  function isDescendant(candidateId, ancestorId) {
    const childArr = getChildrenArray(ancestorId)
    for (const childId of childArr.toArray()) {
      if (childId === candidateId) return true
      const childNode = nodesMap.get(childId)
      if (childNode?.get('type') === 'folder' && isDescendant(candidateId, childId)) {
        return true
      }
    }
    return false
  }

  function findFirstPage() {
    function search(arr) {
      for (const id of arr.toArray()) {
        const nodeMap = nodesMap.get(id)
        if (!nodeMap) continue
        if (nodeMap.get('type') === 'page') return id
        if (nodeMap.get('type') === 'folder') {
          const found = search(getChildrenArray(id))
          if (found) return found
        }
      }
      return null
    }
    return search(rootChildren)
  }

  function setActivePage(id) {
    activePageId.value = id
    broadcastActivePage(id)
  }

  function toggleFolder(id) {
    const s = new Set(expandedFolders.value)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    expandedFolders.value = s
  }

  function getFragment(id) {
    return ydoc.getXmlFragment(`page-${id}`)
  }

  function broadcastActivePage(id) {
    provider.awareness.setLocalStateField('activePage', id)
  }

  // Observe changes — use deep observer on nodesMap + observer on rootChildren
  const syncHandler = () => syncTree()
  nodesMap.observeDeep(syncHandler)
  rootChildren.observe(syncHandler)

  // Also observe all folder children arrays
  const folderObservers = new Map()

  function observeFolderChildren() {
    for (const [id, nodeMap] of nodesMap) {
      if (nodeMap.get('type') === 'folder' && !folderObservers.has(id)) {
        const childArr = getChildrenArray(id)
        childArr.observe(syncHandler)
        folderObservers.set(id, childArr)
      }
    }
  }

  nodesMap.observe(() => {
    observeFolderChildren()
    syncTree()
  })

  // Initialize
  syncTree()
  observeFolderChildren()

  if (tree.value.length === 0) {
    createPage('Untitled')
  } else if (!activePageId.value) {
    const firstPage = findFirstPage()
    if (firstPage) {
      activePageId.value = firstPage
      broadcastActivePage(firstPage)
    }
  }

  onUnmounted(() => {
    nodesMap.unobserveDeep(syncHandler)
    rootChildren.unobserve(syncHandler)
    for (const [, childArr] of folderObservers) {
      childArr.unobserve(syncHandler)
    }
  })

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
  }
}
