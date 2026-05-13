import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendHttpTarget = process.env.VITE_BACKEND_PROXY_TARGET || "http://127.0.0.1:8000"
const backendWsTarget = backendHttpTarget.replace(/^http/i, "ws")

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: backendHttpTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws": {
        target: backendWsTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
