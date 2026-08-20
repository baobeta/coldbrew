import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import RoomMember from './room_member.js'
import RoomInvite from './room_invite.js'

export type RoomVisibility = 'public' | 'unlisted' | 'private'

export default class Room extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare slug: string

  @column()
  declare name: string

  @column()
  declare visibility: RoomVisibility

  @column()
  declare ownerId: number | null

  @column.dateTime()
  declare lastActiveAt: DateTime | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => RoomMember)
  declare members: HasMany<typeof RoomMember>

  @hasMany(() => RoomInvite)
  declare invites: HasMany<typeof RoomInvite>
}
