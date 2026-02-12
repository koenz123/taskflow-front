import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// ВНИМАНИЕ:
// Раньше здесь поднимался локальный dev-API через ./server/videoApi.js и ./server/authApi.js.
// Сейчас фронт ходит к внешнему бэку по VITE_API_BASE (http://167.172.102.120:4000/api),
// поэтому локальный dev-сервер API больше не нужен, и мы убираем плагин полностью.

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
