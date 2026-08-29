import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ['terminal.local', 'localhost'],
    proxy: {
      '/api': 'http://127.0.0.1:4318',
      '/events': { target: 'ws://127.0.0.1:4318', ws: true }
    }
  },
  build: {
    target: 'es2022'
  }
})
