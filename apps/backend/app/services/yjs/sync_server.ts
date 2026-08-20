import config from '@adonisjs/core/services/config'
import type { Server } from 'node:http'
import { WebSocketServer } from 'ws'
import RoomRegistry from './room_registry.js'
import type { CollaborationRoomName, YjsRuntimeConfig } from './types.js'

export default class SyncServer {
  #wss: WebSocketServer | null = null
  #registry: RoomRegistry

  constructor(runtimeConfig: YjsRuntimeConfig = config.get('yjs')) {
    this.#registry = new RoomRegistry(runtimeConfig)
  }

  get registry(): RoomRegistry {
    return this.#registry
  }

  attach(server: Server): void {
    if (this.#wss) return

    this.#wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (request, socket, head) => {
      const roomName = this.#roomNameFromUrl(request.url)
      if (!roomName) {
        socket.destroy()
        return
      }

      this.#wss?.handleUpgrade(request, socket, head, (ws) => {
        const room = this.#registry.getOrCreate(roomName)
        room.connections.set(ws, new Set())
        ws.once('close', () => {
          room.connections.delete(ws)
        })
      })
    })
  }

  async close(): Promise<void> {
    this.#wss?.close()
    this.#wss = null
    await this.#registry.close()
  }

  metrics() {
    return {
      activeConnections: this.#registry.activeConnections,
      warmRooms: this.#registry.warmRooms,
      totalRooms: this.#registry.totalRooms,
    }
  }

  #roomNameFromUrl(url: string | undefined): CollaborationRoomName | null {
    const roomName = (url ?? '/').slice(1)
    if (!roomName.startsWith('writeboard-')) return null
    return roomName as CollaborationRoomName
  }
}
