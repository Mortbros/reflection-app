import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import Pages from 'vite-plugin-pages'
import { sqlitePlugin } from './vite-plugin-sqlite'

// DB path: override with the DB_PATH env var (e.g. on Termux/Linux);
// defaults to the OneDrive path on Windows, ./mappings.db elsewhere.
const DB_PATH =
  process.env.DB_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Users\\sandr\\OneDrive\\Personal\\Reflection\\reflection-app-data\\mappings.db'
    : './mappings.db')

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
