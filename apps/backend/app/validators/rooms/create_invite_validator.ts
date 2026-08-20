import vine from '@vinejs/vine'

export const createInviteValidator = vine.compile(
  vine.object({
    role: vine.enum(['editor', 'viewer']).optional(),
    expiresAt: vine.date().optional(),
  })
)
