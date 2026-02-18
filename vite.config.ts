import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// ВНИМАНИЕ:
// Раньше здесь поднимался локальный dev-API через ./server/videoApi.js и ./server/authApi.js.
// Сейчас фронт ходит к внешнему бэку по VITE_API_BASE (http://167.172.102.120:4000/api),
// поэтому локальный dev-сервер API больше не нужен, и мы убираем плагин полностью.

/** При preview отключаем кэш для index.html, чтобы после каждого билда браузер подхватывал новый билд. */
function noCacheIndexPlugin() {
  return {
    name: 'no-cache-index',
    configurePreviewServer(server: any) {
      server.middlewares.use((req: any, res: any, next: () => void) => {
        const pathname = req.url?.split('?')[0] ?? ''
        if (pathname === '/' || pathname === '/index.html') {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    emptyOutDir: true,
  },
  plugins: [react(), noCacheIndexPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
