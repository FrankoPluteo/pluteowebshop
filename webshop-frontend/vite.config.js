import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  // Add this for production build
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  // Add base URL for proper asset loading
  base: '/',
})