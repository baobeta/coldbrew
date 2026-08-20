import vine from '@vinejs/vine'

export const updateRoomValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120).optional(),
    visibility: vine.enum(['public', 'unlisted', 'private']).optional(),
  })
)
