import type { HttpContext } from '@adonisjs/core/http'
import MetricsService from '#services/metrics/metrics_service'

const metrics = new MetricsService()

export default class MetricsController {
  async show({ response }: HttpContext) {
    return response.ok({
      status: 'ok',
      yjs: metrics.snapshot(),
    })
  }
}
