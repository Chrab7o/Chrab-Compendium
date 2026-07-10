// Scheduled sync: reads a Google Drive mirror of an Obsidian vault and
// upserts its notes into the compendium's Supabase tables. Run by
// .github/workflows/obsidian-sync.yml (cron + manual dispatch); can also be
// run locally with the same env vars for testing.
//
// One-directional (Obsidian -> Compendium): editing a synced entry on the
// site will be overwritten by the next sync. Never deletes — a note that
// disappears from Drive just gets skipped (logged), not removed from the DB.
// Every run re-reads every note under the configured root folder and
// upserts by Drive's permanent file/folder id, so re-runs are idempotent
// and renames/moves in Drive resolve to updates, not duplicates.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile } from './lib/env.mjs'
import { createDriveClient, walkDrive, downloadText, downloadBuffer } from './lib/drive.mjs'
import {
  isMarkdownFile,
  isImageFile,
  basenameNoExt,
  parseFrontmatter,
  normalizeTags,
  resolveWikilinks,
} from '../src/lib/obsidianImport.js'

// No-op in GitHub Actions (secrets are already real env vars, no .env file
// present there) — lets this same script also be dry-run locally from .env.
loadEnvFile(new URL('../.env', import.meta.url))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(
  readFileSync(path.join(__dirname, 'obsidian-sync.config.json'), 'utf8')
)

const EMBED_RE = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g
const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

async function main() {
  const drive = await createDriveClient()

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: process.env.SYNC_DM_EMAIL,
    password: process.env.SYNC_DM_PASSWORD,
  })
  if (signInError) throw new Error(`Supabase sign-in failed: ${signInError.message}`)

  console.log('Walking Drive folder tree...')
  const allFiles = await walkDrive(drive, config.rootFolderId)
  const noteFiles = allFiles.filter((f) => isMarkdownFile(f.name))
  const imageFiles = allFiles.filter((f) => isImageFile(f.name))
  const imagesByName = new Map(imageFiles.map((f) => [f.name.toLowerCase(), f]))
  console.log(`Found ${noteFiles.length} notes, ${imageFiles.length} images.`)

  // --- Parse every note, resolving its category/visibility/campaign from
  // config.folders by its top-level folder name. Notes whose top folder
  // isn't in the config are skipped (not guessed at). ---
  const parsedNotes = []
  let skipped = 0
  for (const file of noteFiles) {
    const topFolderName = file.pathSegments[0] ?? '(root)'
    const folderConfig = config.folders[topFolderName]
    if (!folderConfig) {
      console.warn(`Skipping "${file.name}" — top folder "${topFolderName}" not in config.folders`)
      skipped += 1
      continue
    }
    const text = await downloadText(drive, file.id)
    const { frontmatter, body } = parseFrontmatter(text)
    parsedNotes.push({
      driveId: file.id,
      name: file.name,
      body,
      frontmatter,
      title: frontmatter.title || basenameNoExt(file.name),
      category: folderConfig.category,
      visibility: folderConfig.visibility || config.defaultVisibility,
      campaignId: folderConfig.campaignId ?? config.defaultCampaignId ?? null,
      // The top segment only picks the category (matching the browser
      // importer's convention) — everything below it becomes real nested
      // folders.
      nestedNames: file.pathSegments.slice(1),
      nestedDriveIds: file.folderIdPath.slice(1),
      tags: normalizeTags(frontmatter),
    })
  }

  // --- Folder chain upsert, keyed by Drive folder id ---
  const folderIdByDriveId = new Map() // Drive folder id -> DB folder uuid
  const siblingCounts = new Map()
  async function resolveFolderChain(category, campaignId, driveIds, names) {
    let parentId = null
    for (let i = 0; i < driveIds.length; i++) {
      const driveId = driveIds[i]
      const name = names[i]
      if (folderIdByDriveId.has(driveId)) {
        parentId = folderIdByDriveId.get(driveId)
        continue
      }
      const { data: existing } = await supabase
        .from('folders')
        .select('id')
        .eq('obsidian_folder_id', driveId)
        .maybeSingle()
      if (existing) {
        await supabase
          .from('folders')
          .update({ name, parent_folder_id: parentId, category, campaign_id: campaignId })
          .eq('id', existing.id)
        folderIdByDriveId.set(driveId, existing.id)
        parentId = existing.id
        continue
      }
      const siblingKey = `${category}|${parentId}`
      const sortOrder = siblingCounts.get(siblingKey) ?? 0
      siblingCounts.set(siblingKey, sortOrder + 1)
      const { data, error } = await supabase
        .from('folders')
        .insert({
          name,
          category,
          parent_folder_id: parentId,
          campaign_id: campaignId,
          sort_order: sortOrder,
          obsidian_folder_id: driveId,
        })
        .select()
        .single()
      if (error) throw error
      folderIdByDriveId.set(driveId, data.id)
      parentId = data.id
    }
    return parentId
  }

  // --- Entry upsert, keyed by Drive file id ---
  let created = 0
  let updated = 0
  const titleToId = new Map()
  const processed = []
  for (const note of parsedNotes) {
    try {
      const folderId = await resolveFolderChain(
        note.category,
        note.campaignId,
        note.nestedDriveIds,
        note.nestedNames
      )
      const { data: existing } = await supabase
        .from('entries')
        .select('id')
        .eq('obsidian_file_id', note.driveId)
        .maybeSingle()

      const fields = {
        title: note.title,
        content: note.body,
        category: note.category,
        visibility: note.visibility,
        campaign_id: note.campaignId,
        folder_id: folderId,
        tags: note.tags,
      }

      let entryId
      if (existing) {
        const { error } = await supabase.from('entries').update(fields).eq('id', existing.id)
        if (error) throw error
        entryId = existing.id
        updated += 1
      } else {
        const { data, error } = await supabase
          .from('entries')
          .insert({ ...fields, obsidian_file_id: note.driveId })
          .select()
          .single()
        if (error) throw error
        entryId = data.id
        created += 1
      }

      titleToId.set(basenameNoExt(note.name).toLowerCase(), entryId)
      if (note.frontmatter.title) {
        titleToId.set(String(note.frontmatter.title).toLowerCase(), entryId)
      }
      processed.push({ ...note, entryId })
    } catch (err) {
      console.error(`Failed to sync "${note.title}": ${err.message}`)
    }
  }

  // --- Images: only upload ones actually referenced via ![[embed]], and
  // only if not already cached from a previous run. ---
  const neededImages = new Set()
  for (const note of processed) {
    for (const match of note.body.matchAll(EMBED_RE)) {
      const filename = match[1].trim().split('/').pop().toLowerCase()
      if (isImageFile(filename)) neededImages.add(filename)
    }
  }
  const assetUrls = new Map()
  let uploaded = 0
  let reused = 0
  for (const filename of neededImages) {
    const driveImage = imagesByName.get(filename)
    if (!driveImage) continue
    const { data: cached } = await supabase
      .from('obsidian_synced_images')
      .select('storage_path')
      .eq('drive_file_id', driveImage.id)
      .maybeSingle()
    if (cached) {
      assetUrls.set(filename, supabase.storage.from('entry-images').getPublicUrl(cached.storage_path).data.publicUrl)
      reused += 1
      continue
    }
    try {
      const buffer = await downloadBuffer(drive, driveImage.id)
      const ext = filename.split('.').pop()
      const storagePath = `${randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('entry-images')
        .upload(storagePath, buffer, { contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream' })
      if (uploadError) throw uploadError
      await supabase
        .from('obsidian_synced_images')
        .insert({ drive_file_id: driveImage.id, storage_path: storagePath })
      assetUrls.set(filename, supabase.storage.from('entry-images').getPublicUrl(storagePath).data.publicUrl)
      uploaded += 1
    } catch (err) {
      console.error(`Failed to upload image "${filename}": ${err.message}`)
    }
  }

  // --- Resolve [[wikilinks]] / ![[embeds]] now that every note in this run
  // has an entry id, and update any entry whose content changed. ---
  const unresolvedLinks = []
  for (const note of processed) {
    const { resolved, unresolved } = resolveWikilinks(note.body, titleToId, assetUrls)
    if (unresolved.length > 0) unresolvedLinks.push({ title: note.title, links: unresolved })
    if (resolved !== note.body) {
      await supabase.from('entries').update({ content: resolved }).eq('id', note.entryId)
    }
  }

  console.log('--- Sync summary ---')
  console.log(`Entries created: ${created}, updated: ${updated}, skipped (unmapped folder): ${skipped}`)
  console.log(`Images uploaded: ${uploaded}, reused from cache: ${reused}`)
  if (unresolvedLinks.length > 0) {
    console.log(`${unresolvedLinks.length} notes have unresolved links:`)
    for (const u of unresolvedLinks) console.log(`  - ${u.title}: ${u.links.join(', ')}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
