import { defineConfig } from '@playwright/test'
import path from 'path'

const STUB_PORT = 8931
const API_PORT = 8001
const FRONT_PORT = 5174
const DB_FILE = path.join(__dirname, '.tmp', 'e2e.db')

export default defineConfig({
  testDir: './tests',
  // Один воркер: бэкенд ходит в общий SQLite-файл, параллельные спеки ловят "database is locked".
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${FRONT_PORT}` },
  webServer: [
    {
      command: 'python3 fake_openrouter.py',
      url: `http://127.0.0.1:${STUB_PORT}/`,
    },
    {
      // Каждый прогон стартует с чистой БД, поэтому она лежит отдельно от chat.db.
      command: `mkdir -p ${path.dirname(DB_FILE)} && rm -f ${DB_FILE} && uv run uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../api',
      url: `http://127.0.0.1:${API_PORT}/docs`,
      env: {
        DATABASE_URL: `sqlite:///${DB_FILE}`,
        OPENROUTER_BASE_URL: `http://127.0.0.1:${STUB_PORT}/v1`,
        OPENROUTER_API_KEY: 'stub-key',
        TOKEN_LIMIT: '1000',
      },
    },
    {
      command: `npm run dev -- --port ${FRONT_PORT} --strictPort`,
      cwd: '../front',
      url: `http://127.0.0.1:${FRONT_PORT}`,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
})
