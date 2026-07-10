// One-time (or repeatable) export of the current compendium structure into
// a local Obsidian-vault-shaped folder tree — so you can bootstrap a vault
// that already matches the site's categories/folders instead of retyping
// them by hand. Writes one .md file per entry (with frontmatter) into the
// matching category/folder directory.
//
// Needs a DM-authenticated read to see everything (including DM-only
// content), so it signs in like scripts/obsidian-sync.mjs does — but this
// one is meant to run locally with YOUR OWN DM login, not the sync-bot
// account, since it's a one-off local tool rather than something scheduled.
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env (same file
// `npm run dev` uses) plus EXPORT_DM_EMAIL / EXPORT_DM_PASSWORD, which you
// can add to that same local, gitignored .env just for running this.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { dump as dumpYaml } from 'js-yaml'

function loadEnvFile(file) {
  try {
    const text = readFileSync(file, 'utf8')
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
loadEnvFile(new URL('../.env', import.meta.url))

const OUT_DIR = process.env.EXPORT_DIR || 'obsidian-export'

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'untitled'
}

async function main() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: process.env.EXPORT_DM_EMAIL,
    password: process.env.EXPORT_DM_PASSWORD,
  })
  if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`)

  const [
    { data: categories },
    { data: folders },
    { data: entries },
    { data: placements },
    { data: campaigns },
  ] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('folders').select('*'),
    supabase.from('entries').select('*'),
    supabase.from('entry_placements').select('*'),
    supabase.from('campaigns').select('*'),
  ])

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]))
  const folderById = new Map(folders.map((f) => [f.id, f]))

  function folderDirParts(folder) {
    const chain = []
    let current = folder
    while (current) {
      chain.unshift(sanitize(current.name))
      current = current.parent_folder_id ? folderById.get(current.parent_folder_id) : null
    }
    return chain
  }

  function categoryDirName(categoryValue) {
    const cat = categories.find((c) => c.value === categoryValue)
    return sanitize(cat?.label || categoryValue)
  }

  // Every place an entry appears: its primary spot, plus any extra
  // entry_placements rows (multi-location entries).
  const placementRows = [
    ...entries.map((e) => ({ entryId: e.id, category: e.category, folderId: e.folder_id, primary: true })),
    ...placements.map((p) => ({ entryId: p.entry_id, category: p.category, folderId: p.folder_id, primary: false })),
  ]

  let written = 0
  for (const row of placementRows) {
    const entry = entries.find((e) => e.id === row.entryId)
    if (!entry) continue

    const dirParts = [OUT_DIR, categoryDirName(row.category)]
    if (row.folderId) {
      const folder = folderById.get(row.folderId)
      if (folder) dirParts.push(...folderDirParts(folder))
    }
    const dir = path.join(...dirParts)
    mkdirSync(dir, { recursive: true })

    const filename = row.primary
      ? `${sanitize(entry.title)}.md`
      : `${sanitize(entry.title)} (also in ${categoryDirName(row.category)}).md`

    const frontmatter = dumpYaml({
      title: entry.title,
      tags: entry.tags ?? [],
      visibility: entry.visibility,
      campaign: entry.campaign_id ? campaignNameById.get(entry.campaign_id) ?? null : null,
    })
    writeFileSync(path.join(dir, filename), `---\n${frontmatter}---\n\n${entry.content}\n`, 'utf8')
    written += 1
  }

  console.log(`Exported ${written} notes into "${OUT_DIR}/".`)
  console.log(
    'Note: internal links/images are exported exactly as stored (plain Markdown), not converted'
  )
  console.log(
    'back into Obsidian [[wikilink]]/![[embed]] syntax — they will still render as normal'
  )
  console.log('Markdown links/images, just not Obsidian-native ones unless you convert by hand.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
