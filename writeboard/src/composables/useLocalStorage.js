import * as Y from 'yjs'
import { config } from '@/config.js'

function encodeUpdate(update) {
  const chunks = []
  for (let i = 0; i < update.length; i += 8192) {
    chunks.push(String.fromCharCode.apply(null, update.subarray(i, i + 8192)))
  }
  return btoa(chunks.join(''))
}

function decodeUpdate(encoded) {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function getStoredUserName() {
  return localStorage.getItem('writeboard-username')
}

export function setStoredUserName(name) {
  localStorage.setItem('writeboard-username', name)
}

export function useDocPersistence(ydoc, roomId) {
  const docKey = `writeboard-doc-${roomId}`
  const stored = localStorage.getItem(docKey)
  if (stored) {
    Y.applyUpdate(ydoc, decodeUpdate(stored))
  }

  let saveTimeout = null
  ydoc.on('update', () => {
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      try {
        const state = Y.encodeStateAsUpdate(ydoc)
        const encoded = encodeUpdate(state)
        localStorage.setItem(docKey, encoded)
      } catch (e) {
        console.warn('Failed to save to localStorage:', e)
      }
    }, config.docSaveDebounceMs)
  })

  return {
    cleanup() {
      clearTimeout(saveTimeout)
    },
  }
}

export function trackRecentRoom(roomId) {
  const roomsKey = 'writeboard-rooms'
  const rooms = JSON.parse(localStorage.getItem(roomsKey) || '[]')
  const existing = rooms.findIndex(r => r.id === roomId)
  if (existing >= 0) rooms.splice(existing, 1)
  rooms.unshift({ id: roomId, lastVisited: Date.now() })
  if (rooms.length > config.maxRecentRooms) rooms.length = config.maxRecentRooms
  localStorage.setItem(roomsKey, JSON.stringify(rooms))
}
