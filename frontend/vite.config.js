import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-admin', manifest: true },
  css: { preprocessorOptions: { scss: { quietDeps: true, silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'] } } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/sitemap.xml': { target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000', changeOrigin: true },
      '/sitemaps': { target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000', changeOrigin: true },
      '/robots.txt': { target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000', changeOrigin: true },
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
