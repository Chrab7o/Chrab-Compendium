import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Repo is served at https://<user>.github.io/Chrab-Corner/, so assets
// must be requested from that subpath rather than the domain root.
export default defineConfig({
  plugins: [react()],
  base: '/Chrab-Corner/',
})
