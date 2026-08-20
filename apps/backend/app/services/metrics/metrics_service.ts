import type { YjsMetricsSnapshot } from '#services/yjs/types'

export default class MetricsService {
  #snapshot: YjsMetricsSnapshot = {
    activeConnections: 0,
    warmRooms: 0,
    totalRooms: 0,
    loadFailures: 0,
    storeFailures: 0,
    migrationFailures: 0,
    skippedSends: 0,
  }

  snapshot(): YjsMetricsSnapshot {
    return { ...this.#snapshot }
  }

  replace(snapshot: Partial<YjsMetricsSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...snapshot }
  }

  increment(metric: keyof YjsMetricsSnapshot, by = 1): void {
    this.#snapshot[metric] += by
  }
}
