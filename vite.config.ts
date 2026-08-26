import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { Agent } from 'node:http'

const apiProxyAgent = new Agent({ keepAlive: true, maxSockets: 8 })

export default defineConfig({
  cacheDir: 'node_modules/.vite-medical-bi',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5175', agent: apiProxyAgent },
    },
  },
})
