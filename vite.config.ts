import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import oxlintPlugin from 'vite-plugin-oxlint'
import { fileURLToPath } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/coldbrew/' : '/',
  plugins: [
    vue(),
    tailwindcss(),
    oxlintPlugin({ configFile: '.oxlintrc.json' }),
    AutoImport({
      imports: ['vue'],
      dirs: ['./src/composables'],
      dts: './src/auto-imports.d.ts',
      vueTemplate: true,
    }),
    Components({
      dirs: ['src/components'],
      dts: './src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
