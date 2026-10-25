import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const maplibreWorkerDependencyPlugin = () => ({
  name: 'copy-maplibre-worker-dependency',
  writeBundle({ dir }) {
    copyFileSync(
      resolve(process.cwd(), 'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs'),
      resolve(dir || 'dist', 'assets/maplibre-gl-shared.mjs')
    )
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'
  const wsUrl = env.VITE_WS_URL || apiUrl.replace(/^http/, 'ws')

  return {
    plugins: [react(), maplibreWorkerDependencyPlugin()],
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
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