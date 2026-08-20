import type Room from '#models/room'
import type User from '#models/user'

export default class RoomPolicy {
  canView(user: User | null, room: Room): boolean {
    if (room.visibility !== 'private') return true
    if (!user) return false
    return room.ownerId === user.id
  }

  canEdit(user: User | null, room: Room): boolean {
    if (room.visibility !== 'private') return true
    if (!user) return false
    return room.ownerId === user.id
  }
}
