import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    // Backend apps have their own test runners. Keep Vitest focused on the Vue
    // client so it does not collect Adonis/Japa or legacy Node test files.
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', 'apps/backend/**', 'server/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
