import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { createVideoApi } from './server/videoApi.js'
import { createAuthApi } from './server/authApi.js'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    {
      name: 'video-api-dev',
      configureServer(server) {
        const worksFile = path.resolve(__dirname, 'server/data/works.json')
        const uploadsDir = path.resolve(__dirname, 'server/uploads/videos')
        const dataDir = path.resolve(__dirname, 'server/data')
        server.middlewares.use(
          createVideoApi({
            worksFile,
            uploadsDir,
            maxFileBytes: 2 * 1024 * 1024 * 1024,
          }),
        )
        server.middlewares.use(
          createAuthApi({
            dataDir,
            appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173',
          }),
        )
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
