import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Room from './room.js'

export type RoomInviteRole = 'editor' | 'viewer'

export default class RoomInvite extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare roomId: number

  @column()
  declare tokenHash: string

  @column()
  declare role: RoomInviteRole

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => Room)
  declare room: BelongsTo<typeof Room>
}
