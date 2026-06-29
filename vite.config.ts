import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import Pages from 'vite-plugin-pages'
import { sqlitePlugin } from './vite-plugin-sqlite'

const DB_PATH = 'C:\\Users\\sandr\\OneDrive\\Personal\\Reflection\\reflection-app-data\\mappings.db'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    Pages(),
    sqlitePlugin(DB_PATH),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
