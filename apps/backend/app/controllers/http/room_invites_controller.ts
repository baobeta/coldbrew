import type { HttpContext } from '@adonisjs/core/http'
import Room from '#models/room'
import RoomInvite from '#models/room_invite'
import { createInviteValidator } from '#validators/rooms/create_invite_validator'
import { createHash, randomBytes } from 'node:crypto'

export default class RoomInvitesController {
  async store({ params, request, response }: HttpContext) {
    const room = await Room.findByOrFail('slug', params.slug)
    const payload = await request.validateUsing(createInviteValidator)
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const invite = await RoomInvite.create({
      roomId: room.id,
      tokenHash,
      role: payload.role ?? 'editor',
      expiresAt: payload.expiresAt ?? null,
    })

    return response.created({
      invite: {
        id: invite.id,
        token,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
    })
  }
}
