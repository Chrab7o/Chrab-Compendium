// One-off local tool: tags EXISTING folders/entries (created by the old
// one-shot browser importer, before obsidian_folder_id/obsidian_file_id
// existed) with their matching Drive folder/file id, by matching on
// name/title — no deleting, no recreating, so entry ids never change (which
// matters if anything, e.g. a map marker, links to one by id).
//
// Run this once, BEFORE the very first real obsidian-sync run, whenever a
// Drive folder is seeded with content that's a copy of what's already on
// the site (e.g. via scripts/obsidian-export.mjs) — otherwise that first
// sync won't recognize the existing rows and will create duplicates
// alongside them instead of updating them in place.
//
// Same local-only credentials as scripts/obsidian-export.mjs
// (EXPORT_DM_EMAIL/EXPORT_DM_PASSWORD in .env), plus GDRIVE_SERVICE_ACCOUNT_KEY
// (normally only a GitHub secret) added to your local .env too, since this
// needs to read the same Drive folder the scheduled sync does.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile } from './lib/env.mjs'
import { createDriveClient, walkDrive, downloadText } from './lib/drive.mjs'
import { isMarkdownFile, basenameNoExt, parseFrontmatter } from '../src/lib/obsidianImport.js'

loadEnvFile(new URL('../.env', import.meta.url))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(
  readFileSync(path.join(__dirname, 'obsidian-sync.config.json'), 'utf8')
)

async function main() {
  const drive = await createDriveClient()
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

  console.log('Walking Drive folder tree...')
  const allFiles = await walkDrive(drive, config.rootFolderId)
  const noteFiles = allFiles.filter((f) => isMarkdownFile(f.name))
  console.log(`Found ${noteFiles.length} notes in Drive.`)

  const { data: allFolders } = await supabase.from('folders').select('*')
  const { data: allEntries } = await supabase.from('entries').select('*')

  const folderIdCache = new Map() // Drive folder id -> DB folder id (once matched)
  let foldersTagged = 0
  let entriesTagged = 0
  let newFolders = 0
  let newEntries = 0
  let ambiguous = 0

  for (const file of noteFiles) {
    const topFolderName = file.pathSegments[0] ?? '(root)'
    const folderConfig = config.folders[topFolderName]
    if (!folderConfig) {
      console.warn(`Skipping "${file.name}" — top folder "${topFolderName}" not in config.folders`)
      continue
    }
    const category = folderConfig.category
    const nestedNames = file.pathSegments.slice(1)
    const nestedDriveIds = file.folderIdPath.slice(1)

    // Walk the nested folder chain, matching each level by name + parent +
    // category against the existing DB folders (not by Drive id — that's
    // exactly what's missing and what we're backfilling).
    let parentId = null
    let chainBroken = false
    for (let i = 0; i < nestedNames.length; i++) {
      const driveId = nestedDriveIds[i]
      const name = nestedNames[i]
      if (folderIdCache.has(driveId)) {
        parentId = folderIdCache.get(driveId)
        continue
      }
      const match = allFolders.find(
        (f) => f.name === name && f.category === category && (f.parent_folder_id ?? null) === parentId
      )
      if (!match) {
        console.log(
          `No existing folder matches "${nestedNames.slice(0, i + 1).join('/')}" — the sync will create it fresh.`
        )
        newFolders += 1
        chainBroken = true
        break
      }
      if (match.obsidian_folder_id && match.obsidian_folder_id !== driveId) {
        console.warn(`Folder "${name}" is already tagged with a different Drive id — skipping, check manually.`)
        chainBroken = true
        break
      }
      if (!match.obsidian_folder_id) {
        await supabase.from('folders').update({ obsidian_folder_id: driveId }).eq('id', match.id)
        foldersTagged += 1
      }
      folderIdCache.set(driveId, match.id)
      parentId = match.id
    }
    if (chainBroken) continue

    const text = await downloadText(drive, file.id)
    const { frontmatter } = parseFrontmatter(text)
    const title = frontmatter.title || basenameNoExt(file.name)

    const candidates = allEntries.filter(
      (e) => e.category === category && (e.folder_id ?? null) === parentId && e.title === title
    )
    if (candidates.length === 0) {
      console.log(`No existing entry matches "${title}" — the sync will create it fresh.`)
      newEntries += 1
      continue
    }
    if (candidates.length > 1) {
      console.warn(`Multiple entries titled "${title}" in the same folder — skipping, tag manually.`)
      ambiguous += 1
      continue
    }
    const entry = candidates[0]
    if (entry.obsidian_file_id && entry.obsidian_file_id !== file.id) {
      console.warn(`Entry "${title}" is already tagged with a different Drive id — skipping, check manually.`)
      continue
    }
    if (!entry.obsidian_file_id) {
      await supabase.from('entries').update({ obsidian_file_id: file.id }).eq('id', entry.id)
      entriesTagged += 1
    }
  }

  console.log('--- Backfill summary ---')
  console.log(`Folders newly tagged: ${foldersTagged}, entries newly tagged: ${entriesTagged}`)
  console.log(`Expected to be created fresh by the next sync — folders: ${newFolders}, entries: ${newEntries}`)
  if (ambiguous > 0) {
    console.log(`${ambiguous} ambiguous entries skipped — resolve by hand before running the sync.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
