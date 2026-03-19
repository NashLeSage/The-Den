import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: [
      'c1ff1cdd-574e-4558-aed1-a6ccd6574e51-00-3doid22vbf9af.kirk.replit.dev'
    ]
  }
})