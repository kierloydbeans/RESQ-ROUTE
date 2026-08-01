import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'
  const wsUrl = env.VITE_WS_URL || apiUrl.replace(/^http/, 'ws')

  return {
    plugins: [react()],
    server: {
      port: 3000,
      allowedHosts: [
        'undappled-bea-schemeful.ngrok-free.dev',
        '.ngrok-free.dev', // Allows any .ngrok-free.dev subdomain
        '.ngrok-free.app', // Allows any .ngrok-free.app subdomain
        '.loca.lt',        // Allows any .loca.lt subdomain
      ],
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/ws': {
          target: wsUrl,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
          },
        },
      },
    },
  }
})