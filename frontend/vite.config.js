import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = [
  'patrica-cerebrospinal-ty.ngrok-free.dev',
  '.ngrok-free.dev',
  '.ngrok-free.app',
]

function backendProxy() {
  return {
    '/api': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
    '/media': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
    '/ws': {
      target: 'ws://127.0.0.1:8000',
      changeOrigin: true,
      ws: true,
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2018',
  },
  server: {
    allowedHosts,
    proxy: backendProxy(),
  },
  preview: {
    allowedHosts,
    proxy: backendProxy(),
  },
})
