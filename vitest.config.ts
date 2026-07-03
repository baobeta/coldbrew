import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    // The server has its own node:test suites (server/__tests__/*.mjs) run via
    // `node --test`. Exclude them so vitest (client runner) doesn't try to load them.
    exclude: ['node_modules', 'dist', 'server/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
