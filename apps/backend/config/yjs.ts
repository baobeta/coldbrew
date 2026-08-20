import env from '#start/env'

const yjsConfig = {
  docFlushMs: env.get('YJS_DOC_FLUSH_MS'),
  maxBufferedBytes: env.get('YJS_MAX_BUFFERED_BYTES'),
  maxWarmRooms: env.get('YJS_MAX_WARM_ROOMS'),
  storeDebounceMs: env.get('YJS_STORE_DEBOUNCE_MS'),
  leveldbPath: env.get('YJS_LEVELDB_PATH'),
  websocketPath: env.get('YJS_WEBSOCKET_PATH'),
}

export default yjsConfig
