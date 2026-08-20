import Room from '#models/room'
import { randomUUID } from 'node:crypto'

export type RoomVisibility = 'public' | 'unlisted' | 'private'

export interface CreateRoomInput {
  name?: string
  visibility?: RoomVisibility
  ownerId?: number | null
}

export default class RoomService {
  async create(input: CreateRoomInput = {}): Promise<Room> {
    return Room.create({
      slug: randomUUID().replaceAll('-', '').slice(0, 16),
      name: input.name ?? 'Untitled room',
      visibility: input.visibility ?? 'public',
      ownerId: input.ownerId ?? null,
    })
  }
}
