import { readFileSync } from 'node:fs'

// Minimal KEY=VALUE .env loader for plain `node script.mjs` runs (Vite's own
// .env loading only applies to `vite dev`/`vite build`). Doesn't override
// already-set real env vars (e.g. GitHub Actions secrets), so the same
// scripts work both locally (via .env) and in CI.
export function loadEnvFile(fileUrl) {
  try {
    const text = readFileSync(fileUrl, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // no .env file present — fine, rely on real env vars instead
  }
}
