import { ref, onUnmounted } from 'vue'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { nanoid } from 'nanoid'

const USER_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#00bcd4', '#009688',
  '#4caf50', '#ff9800', '#ff5722', '#795548',
]

function randomColor() {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
}

function getOrCreateUserName() {
  let name = localStorage.getItem('writeboard-username')
  if (!name) {
    name = 'User-' + nanoid(4)
    localStorage.setItem('writeboard-username', name)
  }
  return name
}

export function useCollaboration(roomId) {
  const ydoc = new Y.Doc()
  const provider = new WebrtcProvider(`writeboard-${roomId}`, ydoc, {
    signaling: ['wss://signaling.yjs.dev'],
  })

  const userName = getOrCreateUserName()
  const userColor = randomColor()
  const peerCount = ref(1)
  const connectionStatus = ref('connecting')

  provider.awareness.setLocalStateField('user', {
    name: userName,
    color: userColor,
  })

  provider.awareness.on('change', () => {
    peerCount.value = provider.awareness.getStates().size
  })

  provider.on('status', (event) => {
    connectionStatus.value = event.connected ? 'connected' : 'disconnected'
  })

  // localStorage persistence: save Y.Doc on changes
  const docKey = `writeboard-doc-${roomId}`
  const stored = localStorage.getItem(docKey)
  if (stored) {
    Y.applyUpdate(ydoc, Uint8Array.from(atob(stored), c => c.charCodeAt(0)))
  }

  let saveTimeout = null
  ydoc.on('update', () => {
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      try {
        const state = Y.encodeStateAsUpdate(ydoc)
        const encoded = btoa(String.fromCharCode(...state))
        localStorage.setItem(docKey, encoded)
      } catch (e) {
        console.warn('Failed to save to localStorage:', e)
      }
    }, 500)
  })

  // Track room in recent rooms list
  const roomsKey = 'writeboard-rooms'
  const rooms = JSON.parse(localStorage.getItem(roomsKey) || '[]')
  const existing = rooms.findIndex(r => r.id === roomId)
  if (existing >= 0) rooms.splice(existing, 1)
  rooms.unshift({ id: roomId, lastVisited: Date.now() })
  if (rooms.length > 20) rooms.length = 20
  localStorage.setItem(roomsKey, JSON.stringify(rooms))

  onUnmounted(() => {
    clearTimeout(saveTimeout)
    provider.destroy()
    ydoc.destroy()
  })

  return {
    ydoc,
    provider,
    userName,
    userColor,
    peerCount,
    connectionStatus,
  }
}
