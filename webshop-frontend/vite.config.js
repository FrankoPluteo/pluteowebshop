import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // <--- Add this line
    port: 5173, // Or whatever port you prefer, e.g., 3001
  },
})
