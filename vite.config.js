import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from a custom domain (compendium.chrab.us) at the root, not from
// a /Chrab-Corner/ subpath — so assets must be requested from root too.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  resolve: {
    // `@/*` -> `src/*` - the import alias shadcn/ui (and anything scaffolded
    // through its CLI, e.g. Kokonut UI components) expects to exist.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
