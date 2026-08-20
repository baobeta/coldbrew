import type { CollaborationRoomName, PageRoomName, TreeRoomName } from './types.js'

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

export function isValidRoomId(roomId: string): boolean {
  return ROOM_ID_PATTERN.test(roomId)
}

export function treeRoomName(roomId: string): TreeRoomName {
  if (!isValidRoomId(roomId)) {
    throw new Error(`Invalid room id: ${roomId}`)
  }

  return `writeboard-${roomId}`
}

export function pageRoomName(roomId: string, pageId: string): PageRoomName {
  if (!isValidRoomId(roomId)) {
    throw new Error(`Invalid room id: ${roomId}`)
  }
  if (!isValidRoomId(pageId)) {
    throw new Error(`Invalid page id: ${pageId}`)
  }

  return `writeboard-${roomId}--page--${pageId}`
}

export function isPageRoomName(roomName: CollaborationRoomName): roomName is PageRoomName {
  return roomName.includes('--page--')
}

export function roomIdFromTreeRoomName(roomName: TreeRoomName): string {
  return roomName.replace(/^writeboard-/, '')
}
