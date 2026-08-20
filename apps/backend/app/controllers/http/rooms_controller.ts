import type { HttpContext } from '@adonisjs/core/http'
import Room from '#models/room'
import RoomService from '#services/rooms/room_service'
import { createRoomValidator } from '#validators/rooms/create_room_validator'
import { updateRoomValidator } from '#validators/rooms/update_room_validator'

const roomService = new RoomService()

export default class RoomsController {
  async index({ response }: HttpContext) {
    const rooms = await Room.query().whereNull('deletedAt').orderBy('updatedAt', 'desc').limit(50)
    return response.ok({ rooms })
  }

  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createRoomValidator)
    const room = await roomService.create(payload)
    return response.created({ room })
  }

  async show({ params, response }: HttpContext) {
    const room = await Room.findByOrFail('slug', params.slug)
    return response.ok({ room })
  }

  async update({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(updateRoomValidator)
    const room = await Room.findByOrFail('slug', params.slug)
    room.merge(payload)
    await room.save()
    return response.ok({ room })
  }
}
