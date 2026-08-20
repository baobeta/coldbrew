import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import type { CollaborationRoomName, RoomEntry, YjsRuntimeConfig } from './types.js'
import PersistenceService from './persistence_service.js'

export default class RoomRegistry {
  #rooms = new Map<CollaborationRoomName, RoomEntry>()
  #persistence: PersistenceService

  constructor(private readonly config: YjsRuntimeConfig) {
    this.#persistence = new PersistenceService(config.leveldbPath)
  }

  get persistence(): PersistenceService {
    return this.#persistence
  }

  get totalRooms(): number {
    return this.#rooms.size
  }

  get warmRooms(): number {
    let count = 0
    for (const room of this.#rooms.values()) {
      if (room.connections.size === 0) count++
    }
    return count
  }

  get activeConnections(): number {
    let count = 0
    for (const room of this.#rooms.values()) {
      count += room.connections.size
    }
    return count
  }

  getOrCreate(roomName: CollaborationRoomName): RoomEntry {
    const existing = this.#rooms.get(roomName)
    if (existing) {
      this.#touch(roomName, existing)
      return existing
    }

    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    let storeTimer: NodeJS.Timeout | null = null

    const loaded = this.#persistence.loadRoom(roomName, doc)

    const room: RoomEntry = {
      name: roomName,
      doc,
      awareness,
      connections: new Map(),
      loaded,
      clearStoreTimer() {
        if (storeTimer) {
          clearTimeout(storeTimer)
          storeTimer = null
        }
      },
      async dispose() {
        this.clearStoreTimer()
        awareness.destroy()
        doc.destroy()
      },
    }

    doc.on('update', () => {
      if (storeTimer) return
      storeTimer = setTimeout(() => {
        storeTimer = null
        this.#persistence.storeRoom(roomName, doc).catch(() => {})
      }, this.config.storeDebounceMs)
    })

    this.#rooms.set(roomName, room)
    return room
  }

  async close(): Promise<void> {
    for (const room of this.#rooms.values()) {
      await this.#persistence.storeRoom(room.name, room.doc).catch(() => {})
      await room.dispose()
    }
    this.#rooms.clear()
    await this.#persistence.close()
  }

  #touch(roomName: CollaborationRoomName, room: RoomEntry): void {
    this.#rooms.delete(roomName)
    this.#rooms.set(roomName, room)
  }
}
