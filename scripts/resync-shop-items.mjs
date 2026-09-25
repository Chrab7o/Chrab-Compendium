// Re-sync stocked shop items with the current compiled pool.
//
// Shop descriptions are snapshotted into shop_items when an item is rolled, so
// a shop keeps whatever text the pool held at the time. That is the right
// trade-off for players (the shop page loads ~20 rows, not the whole pool), but
// it means fixing the extractor doesn't retroactively fix shops already stocked.
//
// This rewrites the snapshot for every stocked item whose pool text has since
// changed, matched on item_key. Hand-added and homebrew rows have no item_key
// and are left alone. Nothing is rerolled - the same items stay on the shelf.
//
// Usage: node scripts/resync-shop-items.mjs [--dry]
import { readFileSync } from 'node:fs'

const dry = process.argv.includes('--dry')
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')]
    })
)

const pool = JSON.parse(readFileSync(new URL('../src/data/shop-items/pool.json', import.meta.url), 'utf8'))
const byKey = new Map(pool.map((it) => [it.key, it]))

const auth = await (
  await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.EXPORT_DM_EMAIL, password: env.EXPORT_DM_PASSWORD }),
  })
).json()
if (!auth.access_token) throw new Error(`DM login failed: ${JSON.stringify(auth)}`)

const req = (path, opts = {}) =>
  fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
    },
  })

const rows = await (await req('shop_items?select=id,name,item_key,description,attunement,rarity,source')).json()
const norm = (v) => (v === true ? 'true' : v ?? null)

const changed = []
const orphans = []
for (const row of rows) {
  if (!row.item_key) continue
  const item = byKey.get(row.item_key)
  if (!item) {
    orphans.push(row)
    continue
  }
  if (
    row.description === item.text &&
    row.attunement === norm(item.attunement) &&
    row.rarity === item.rarity &&
    row.source === item.source
  ) {
    continue
  }
  changed.push({ row, item })
}

console.log(`${rows.length} stocked rows, ${changed.length} out of date, ${orphans.length} no longer in the pool`)
for (const { row } of changed) console.log(`  update  ${row.name}`)
for (const row of orphans) console.log(`  orphan  ${row.name} (${row.item_key}) - left as-is`)

if (dry) {
  console.log('\n--dry: nothing written')
} else {
  for (const { row, item } of changed) {
    const res = await req(`shop_items?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        description: item.text,
        attunement: norm(item.attunement),
        rarity: item.rarity,
        source: item.source,
      }),
    })
    if (!res.ok) console.log(`  FAILED ${row.name}: ${await res.text()}`)
  }
  console.log(`\n${changed.length} row(s) re-synced`)
}
