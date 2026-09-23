import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { uploadEntryImage } from '../../../lib/entryImages'
import { useTags } from '../../../contexts/TagContext'
import {
  isImageFile,
  isMarkdownFile,
  basenameNoExt,
  topFolder,
  folderSegments,
  parseFrontmatter,
  normalizeTags,
  resolveWikilinks,
} from '../../../lib/obsidianImport'

const EMBED_RE = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function ObsidianImporter({ campaigns }) {
  const { typeTags, groups, reload: reloadTags } = useTags()
  const [notes, setNotes] = useState([]) // { relativePath, file }
  const [images, setImages] = useState(new Map()) // lowercased filename -> File
  const [vaultName, setVaultName] = useState('')
  const [folderType, setFolderType] = useState({})
  const [defaultVisibility, setDefaultVisibility] = useState('public')
  const [defaultCampaignId, setDefaultCampaignId] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  const collectionGroup = groups.find((g) => g.value === 'collection')

  function handlePick(e) {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    setVaultName(files[0].webkitRelativePath.split('/')[0] ?? '')

    const noteFiles = []
    const imageMap = new Map()
    for (const file of files) {
      const rel = file.webkitRelativePath || file.name
      if (isMarkdownFile(file.name)) noteFiles.push({ relativePath: rel, file })
      else if (isImageFile(file.name)) imageMap.set(file.name.toLowerCase(), file)
    }
    setNotes(noteFiles)
    setImages(imageMap)

    const top = [...new Set(noteFiles.map((n) => topFolder(n.relativePath)))]
    const fallback = typeTags[0]?.value ?? 'lore'
    setFolderType(Object.fromEntries(top.map((f) => [f, fallback])))
    setSummary(null)
    setError(null)
  }

  async function handleImport() {
    setImporting(true)
    setError(null)
    setProgress({ done: 0, total: notes.length, stage: 'reading' })

    try {
      const read = await Promise.all(
        notes.map(async (n) => ({ ...n, text: await n.file.text() }))
      )

      const fallbackType = typeTags[0]?.value ?? 'lore'
      const parsedNotes = read.map((n) => {
        const { frontmatter, body } = parseFrontmatter(n.text)
        const segments = folderSegments(n.relativePath)
        return {
          ...n,
          frontmatter,
          body,
          title: frontmatter.title || basenameNoExt(n.file.name),
          type: folderType[topFolder(n.relativePath)] || fallbackType,
          // Segments below the type-determining top folder become Collection
          // tags, e.g. Location/Region/Talmundre -> "Region" + "Talmundre".
          // Every level is applied, not just the deepest, so filtering by
          // "Region" still finds everything that used to nest beneath it.
          nestedSegments: segments.slice(1),
          tags: normalizeTags(frontmatter),
        }
      })

      // Find-or-create a Collection tag per folder name, reusing ones
      // created for earlier notes on the same path. Same-named folders from
      // different branches deliberately merge into one tag — with no tree to
      // disambiguate them, two "Notes" folders are one "Notes" collection.
      const tagCache = new Map() // name -> tag value
      async function resolveCollectionTags(segments) {
        const values = []
        for (const name of segments) {
          if (tagCache.has(name)) {
            values.push(tagCache.get(name))
            continue
          }
          const value = slugify(name)
          const { error: tagError } = await supabase
            .from('tags')
            .upsert(
              { value, label: name, group_id: collectionGroup?.id ?? null },
              { onConflict: 'value', ignoreDuplicates: true }
            )
          if (tagError) throw tagError
          tagCache.set(name, value)
          values.push(value)
        }
        return values
      }

      // Pass 1: insert every note as an entry.
      setProgress({ done: 0, total: parsedNotes.length, stage: 'importing' })
      const titleToId = new Map()
      const inserted = []
      for (const note of parsedNotes) {
        try {
          const collectionTags = await resolveCollectionTags(note.nestedSegments)
          const { data, error: insertError } = await supabase
            .from('entries')
            .insert({
              title: note.title,
              content: note.body,
              visibility: defaultVisibility,
              campaign_id: defaultCampaignId || null,
              tags: [...new Set([note.type, ...collectionTags, ...note.tags])],
            })
            .select()
            .single()

          if (insertError) throw insertError
          inserted.push({ ...note, id: data.id })
          titleToId.set(basenameNoExt(note.file.name).toLowerCase(), data.id)
          if (note.frontmatter.title) titleToId.set(String(note.frontmatter.title).toLowerCase(), data.id)
        } catch (err) {
          inserted.push({ ...note, error: err.message })
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }

      // Only upload images actually referenced via ![[embed]] syntax.
      const neededImages = new Set()
      for (const note of inserted) {
        for (const match of note.body.matchAll(EMBED_RE)) {
          const filename = match[1].trim().split('/').pop().toLowerCase()
          if (isImageFile(filename)) neededImages.add(filename)
        }
      }
      const assetUrls = new Map()
      for (const filename of neededImages) {
        const file = images.get(filename)
        if (!file) continue
        try {
          assetUrls.set(filename, await uploadEntryImage(file))
        } catch {
          // leave unresolved; noted in unresolvedLinks below via missing map entry
        }
      }

      // Pass 2: resolve [[wikilinks]] and ![[embeds]] now that every note has an id.
      setProgress({ done: 0, total: inserted.length, stage: 'linking' })
      const unresolvedLinks = []
      for (const note of inserted) {
        if (note.error) {
          setProgress((p) => ({ ...p, done: p.done + 1 }))
          continue
        }
        const { resolved, unresolved } = resolveWikilinks(note.body, titleToId, assetUrls)
        if (unresolved.length > 0) unresolvedLinks.push({ title: note.title, links: unresolved })
        if (resolved !== note.body) {
          await supabase.from('entries').update({ content: resolved }).eq('id', note.id)
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }

      await reloadTags()
      setSummary({
        imported: inserted.filter((n) => !n.error).length,
        failed: inserted.filter((n) => n.error),
        imagesUploaded: assetUrls.size,
        collectionsCreated: tagCache.size,
        unresolvedLinks,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  const topFolders = Object.keys(folderType)

  return (
    <div className="dm-panel">
      <h2>Import Obsidian Vault</h2>
      <p className="view-subtitle">
        Select your vault folder. Each note's top-level folder picks its Type below; every folder
        level beneath that becomes a Collection tag, so a note at
        Location/Region/Talmundre comes through tagged both "Region" and "Talmundre" and turns up
        under either. [[wikilinks]] between notes and ![[embedded images]] are resolved after
        import. Callouts and comments aren't converted — they'll come through as plain text.
      </p>
      <input type="file" webkitdirectory="true" directory="true" multiple onChange={handlePick} />

      {notes.length > 0 && (
        <>
          <p className="status-message">
            {vaultName && `"${vaultName}" — `}
            {notes.length} notes, {images.size} images found.
          </p>

          <div className="dm-form-row">
            <label>
              Default visibility
              <select value={defaultVisibility} onChange={(e) => setDefaultVisibility(e.target.value)}>
                <option value="public">Public</option>
                <option value="dm">DM only</option>
              </select>
            </label>
            <label>
              Default campaign
              <select value={defaultCampaignId} onChange={(e) => setDefaultCampaignId(e.target.value)}>
                <option value="">General (no campaign)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="map-edit-hint">Map each vault folder to an entry Type:</p>
          <div className="folder-category-list">
            {topFolders.map((folder) => (
              <label key={folder} className="folder-category-row">
                {folder}
                <select
                  value={folderType[folder]}
                  onChange={(e) =>
                    setFolderType((prev) => ({ ...prev, [folder]: e.target.value }))
                  }
                >
                  {typeTags.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="dm-form-actions">
            <button type="button" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : `Import ${notes.length} notes`}
            </button>
          </div>

          {progress && (
            <p className="status-message">
              {progress.stage}: {progress.done}/{progress.total}
            </p>
          )}
          {error && <p className="status-message error">{error}</p>}

          {summary && (
            <div className="import-summary">
              <p>
                Imported {summary.imported} entries, created {summary.collectionsCreated} collection
                tags, uploaded {summary.imagesUploaded} images.
              </p>
              {summary.failed.length > 0 && (
                <p className="status-message error">
                  {summary.failed.length} failed: {summary.failed.map((f) => f.title).join(', ')}
                </p>
              )}
              {summary.unresolvedLinks.length > 0 && (
                <details>
                  <summary>{summary.unresolvedLinks.length} notes have unresolved links</summary>
                  <ul>
                    {summary.unresolvedLinks.map((u) => (
                      <li key={u.title}>
                        {u.title}: {u.links.join(', ')}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
