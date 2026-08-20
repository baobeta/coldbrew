import type { WebSocket } from 'ws'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

export type TreeRoomName = `writeboard-${string}`
export type PageRoomName = `writeboard-${string}--page--${string}`
export type CollaborationRoomName = TreeRoomName | PageRoomName

export interface YjsRuntimeConfig {
  docFlushMs: number
  maxBufferedBytes: number
  maxWarmRooms: number
  storeDebounceMs: number
  leveldbPath: string
  websocketPath: string
}

export interface RoomEntry {
  name: CollaborationRoomName
  doc: Y.Doc
  awareness: Awareness
  connections: Map<WebSocket, Set<number>>
  loaded: Promise<void>
  clearStoreTimer(): void
  dispose(): Promise<void>
}

export interface YjsMetricsSnapshot {
  activeConnections: number
  warmRooms: number
  totalRooms: number
  loadFailures: number
  storeFailures: number
  migrationFailures: number
  skippedSends: number
}
