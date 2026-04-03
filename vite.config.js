import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  cacheDir: '/tmp/vite-lumina-cache-v2',
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: false,
    proxy: {
      '/api/mt5': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mt5/, ''),
      },
    },
  },
})
