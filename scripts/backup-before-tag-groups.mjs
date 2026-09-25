// Full-table dump of everything the folders -> tag groups migration
// (supabase/migrations/20260923000000_tag_groups.sql) drops or rewrites.
//
// That migration converts folder structure into tags and then drops the
// folder stack outright, so this is the only copy of the pre-migration shape.
// Runs as the DM so DM-only rows are included; anon would silently miss them.
//
// Usage: node scripts/backup-before-tag-groups.mjs [out-dir]
//        (default: backup/<timestamp>/ - `backup` is gitignored)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')]
    })
)

// Tables the migration drops, plus the ones whose columns it rewrites.
const TABLES = [
  'entries',
  'folders',
  'entry_placements',
  'categories',
  'map_regions',
  'region_folder_links',
  'obsidian_synced_images',
  'tags',
  'campaigns',
]

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = process.argv[2] ?? join('backup', `pre-tag-groups-${stamp}`)

const auth = await (
  await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.EXPORT_DM_EMAIL, password: env.EXPORT_DM_PASSWORD }),
  })
).json()
if (!auth.access_token) throw new Error(`DM login failed: ${JSON.stringify(auth)}`)

mkdirSync(outDir, { recursive: true })

const summary = {}
for (const table of TABLES) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.access_token}` },
  })
  const body = await res.json()
  if (!res.ok) {
    // A table that doesn't exist is fine to note and skip - not every install
    // has the Obsidian sync tables.
    summary[table] = `SKIPPED (HTTP ${res.status}: ${body.message ?? ''})`
    continue
  }
  writeFileSync(join(outDir, `${table}.json`), `${JSON.stringify(body, null, 2)}\n`, 'utf8')
  summary[table] = `${body.length} rows`
}

writeFileSync(
  join(outDir, 'MANIFEST.json'),
  `${JSON.stringify({ takenAt: new Date().toISOString(), before: '20260923000000_tag_groups.sql', tables: summary }, null, 2)}\n`,
  'utf8'
)

console.log(`backup -> ${outDir}`)
for (const [t, n] of Object.entries(summary)) console.log(`  ${t.padEnd(24)} ${n}`)
