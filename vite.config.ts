import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { DEFAULTS } from './shared/defaults'

const clientPort = parseInt(process.env.VIBECRAFT_CLIENT_PORT ?? String(DEFAULTS.CLIENT_PORT), 10)
const serverPort = parseInt(process.env.VIBECRAFT_PORT ?? String(DEFAULTS.SERVER_PORT), 10)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  define: {
    // Inject default port into frontend at build time
    __VIBECRAFT_DEFAULT_PORT__: serverPort,
  },
  server: {
    port: clientPort,
    host: '0.0.0.0',
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '192.168.1.58',
      '100.64.130.41',
      'maxs-macbook-air.tail0eae52.ts.net',
      '*.ts.net'
    ],
    proxy: {
      '/ws': {
        target: `ws://${process.env.VITE_BACKEND_HOST || 'localhost'}:${serverPort}`,
        ws: true,
      },
      '/api': {
        target: `http://${process.env.VITE_BACKEND_HOST || 'localhost'}:${serverPort}`,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
})
