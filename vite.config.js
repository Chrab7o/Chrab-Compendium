import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from a custom domain (compendium.chrab.us) at the root, not from
// a /Chrab-Corner/ subpath — so assets must be requested from root too.
export default defineConfig({
  plugins: [react()],
  base: '/',
})
