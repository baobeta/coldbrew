import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Room from './room.js'
import User from './user.js'

export type RoomMemberRole = 'owner' | 'editor' | 'viewer'

export default class RoomMember extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare roomId: number

  @column()
  declare userId: number

  @column()
  declare role: RoomMemberRole

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => Room)
  declare room: BelongsTo<typeof Room>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
