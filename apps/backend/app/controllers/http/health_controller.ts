import config from '@adonisjs/core/services/config'
import type { HttpContext } from '@adonisjs/core/http'

export default class HealthController {
  async show({ response }: HttpContext) {
    return response.ok({
      status: 'ok',
      app: 'writeboard-backend',
      yjs: {
        websocketPath: config.get('yjs.websocketPath'),
        maxWarmRooms: config.get('yjs.maxWarmRooms'),
      },
    })
  }
}
