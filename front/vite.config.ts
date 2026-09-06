/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiTarget = process.env.API_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // В dev фронт ходит на FastAPI (порт 8000) через прокси — CORS не нужен.
      // В прод FastAPI сам отдаёт собранный dist (см. api/app/main.py).
      '/api': apiTarget,
      '/auth': apiTarget,
    },
  },
  test: {
    environment: 'happy-dom',
  },
})