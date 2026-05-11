import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { useFileTree } from '../useFileTree.js'
import { ref } from 'vue'

// Mock provider with minimal awareness API
function createMockProvider() {
  const localState = {}
  return {
    awareness: {
      setLocalStateField(key, value) {
        localState[key] = value
      },
      getStates() {
        return new Map()
      },
      on() {},
    },
  }
}

// Disable onUnmounted since we're not in a component
import { vi } from 'vitest'
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return {
    ...actual,
    onUnmounted: vi.fn(),
  }
})

describe('useFileTree', () => {
  let ydoc
  let provider
  let fileTree

  beforeEach(() => {
    ydoc = new Y.Doc()
    provider = createMockProvider()
    fileTree = useFileTree(ydoc, provider)
  })

  it('creates a default page on empty doc', () => {
    expect(fileTree.tree.value.length).toBe(1)
    expect(fileTree.tree.value[0].type).toBe('page')
    expect(fileTree.tree.value[0].title).toBe('Untitled')
    expect(fileTree.activePageId.value).toBeTruthy()
  })

  it('creates a page at root', () => {
    const id = fileTree.createPage('My Page')
    expect(id).toBeTruthy()
    const page = fileTree.tree.value.find((n) => n.id === id)
    expect(page).toBeTruthy()
    expect(page.title).toBe('My Page')
    expect(page.type).toBe('page')
  })

  it('creates a folder at root', () => {
    const id = fileTree.createFolder('My Folder')
    const folder = fileTree.tree.value.find((n) => n.id === id)
    expect(folder).toBeTruthy()
    expect(folder.title).toBe('My Folder')
    expect(folder.type).toBe('folder')
    expect(folder.children).toEqual([])
  })

  it('creates a page inside a folder', () => {
    const folderId = fileTree.createFolder('Folder')
    const pageId = fileTree.createPage('Nested Page', folderId)
    const folder = fileTree.tree.value.find((n) => n.id === folderId)
    expect(folder.children.length).toBe(1)
    expect(folder.children[0].id).toBe(pageId)
    expect(folder.children[0].title).toBe('Nested Page')
  })

  it('renames a node', () => {
    const id = fileTree.createPage('Old Name')
    fileTree.rename(id, 'New Name')
    const page = fileTree.tree.value.find((n) => n.id === id)
    expect(page.title).toBe('New Name')
  })

  it('deletes a page', () => {
    const id = fileTree.createPage('To Delete')
    const countBefore = fileTree.tree.value.length
    fileTree.deleteNode(id)
    expect(fileTree.tree.value.length).toBe(countBefore - 1)
    expect(fileTree.tree.value.find((n) => n.id === id)).toBeUndefined()
  })

  it('deletes a folder and its children', () => {
    const folderId = fileTree.createFolder('Folder')
    fileTree.createPage('Child 1', folderId)
    fileTree.createPage('Child 2', folderId)
    fileTree.deleteNode(folderId)
    expect(fileTree.tree.value.find((n) => n.id === folderId)).toBeUndefined()
  })

  it('moves a page to a folder', () => {
    const pageId = fileTree.createPage('Movable')
    const folderId = fileTree.createFolder('Target')
    fileTree.moveNode(pageId, folderId)
    const folder = fileTree.tree.value.find((n) => n.id === folderId)
    expect(folder.children.length).toBe(1)
    expect(folder.children[0].id).toBe(pageId)
    // Should no longer be at root
    expect(fileTree.tree.value.find((n) => n.id === pageId)).toBeUndefined()
  })

  it('prevents moving a folder into its own descendant', () => {
    const parentId = fileTree.createFolder('Parent')
    const childId = fileTree.createFolder('Child', parentId)
    // Try to move Parent into Child — should be blocked
    fileTree.moveNode(parentId, childId)
    // Parent should still be at root
    expect(fileTree.tree.value.find((n) => n.id === parentId)).toBeTruthy()
  })

  it('toggles folder expansion', () => {
    const folderId = fileTree.createFolder('Folder')
    // Folder is expanded after creation
    expect(fileTree.expandedFolders.value.has(folderId)).toBe(true)
    fileTree.toggleFolder(folderId)
    expect(fileTree.expandedFolders.value.has(folderId)).toBe(false)
    fileTree.toggleFolder(folderId)
    expect(fileTree.expandedFolders.value.has(folderId)).toBe(true)
  })

  it('returns an XmlFragment for a page', () => {
    const id = fileTree.createPage('Test')
    const fragment = fileTree.getFragment(id)
    expect(fragment).toBeTruthy()
  })

  it('sets active page on creation', () => {
    const id = fileTree.createPage('Active')
    expect(fileTree.activePageId.value).toBe(id)
  })
})
