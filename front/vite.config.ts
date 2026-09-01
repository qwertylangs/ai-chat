import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // В dev фронт ходит на FastAPI (порт 8000) через прокси — CORS не нужен.
      // В прод FastAPI сам отдаёт собранный dist (см. api/app/main.py).
      '/api': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
    },
  },
})