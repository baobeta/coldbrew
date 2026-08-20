/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Yjs sync runtime
  YJS_DOC_FLUSH_MS: Env.schema.number(),
  YJS_MAX_BUFFERED_BYTES: Env.schema.number(),
  YJS_MAX_WARM_ROOMS: Env.schema.number(),
  YJS_STORE_DEBOUNCE_MS: Env.schema.number(),
  YJS_LEVELDB_PATH: Env.schema.string(),
  YJS_WEBSOCKET_PATH: Env.schema.string(),
})
