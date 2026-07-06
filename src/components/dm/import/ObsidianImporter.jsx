import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { uploadEntryImage } from '../../../lib/entryImages'
import { useCategories } from '../../../contexts/CategoryContext'
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

export default function ObsidianImporter({ campaigns }) {
  const { categories } = useCategories()
  const [notes, setNotes] = useState([]) // { relativePath, file }
  const [images, setImages] = useState(new Map()) // lowercased filename -> File
  const [vaultName, setVaultName] = useState('')
  const [folderCategory, setFolderCategory] = useState({})
  const [defaultVisibility, setDefaultVisibility] = useState('public')
  const [defaultCampaignId, setDefaultCampaignId] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

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

    const folders = [...new Set(noteFiles.map((n) => topFolder(n.relativePath)))]
    setFolderCategory(Object.fromEntries(folders.map((f) => [f, 'lore'])))
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

      const parsedNotes = read.map((n) => {
        const { frontmatter, body } = parseFrontmatter(n.text)
        const segments = folderSegments(n.relativePath)
        return {
          ...n,
          frontmatter,
          body,
          title: frontmatter.title || basenameNoExt(n.file.name),
          category: folderCategory[topFolder(n.relativePath)] || 'lore',
          // Segments below the category-determining top folder become
          // actual nested folders, e.g. Location/Region/Talmundre -> two
          // folders ("Region", "Talmundre") under the Location category.
          nestedSegments: segments.slice(1),
          tags: normalizeTags(frontmatter),
        }
      })

      // Find-or-create the folder chain for a note's nested segments,
      // reusing folders already created for earlier notes on the same path.
      const folderCache = new Map() // `${category}|${parentId}|${name}` -> id
      const siblingCounts = new Map() // `${category}|${parentId}` -> next sort_order
      async function resolveFolderChain(category, segments) {
        let parentId = null
        for (const name of segments) {
          const cacheKey = `${category}|${parentId}|${name}`
          if (folderCache.has(cacheKey)) {
            parentId = folderCache.get(cacheKey)
            continue
          }
          const siblingKey = `${category}|${parentId}`
          const sortOrder = siblingCounts.get(siblingKey) ?? 0
          siblingCounts.set(siblingKey, sortOrder + 1)
          const { data, error: folderError } = await supabase
            .from('folders')
            .insert({
              name,
              category,
              parent_folder_id: parentId,
              campaign_id: defaultCampaignId || null,
              sort_order: sortOrder,
            })
            .select()
            .single()
          if (folderError) throw folderError
          folderCache.set(cacheKey, data.id)
          parentId = data.id
        }
        return parentId
      }

      // Pass 1: insert every note as an entry, creating its folder chain first.
      setProgress({ done: 0, total: parsedNotes.length, stage: 'importing' })
      const titleToId = new Map()
      const inserted = []
      for (const note of parsedNotes) {
        try {
          const folderId = await resolveFolderChain(note.category, note.nestedSegments)
          const { data, error: insertError } = await supabase
            .from('entries')
            .insert({
              title: note.title,
              content: note.body,
              category: note.category,
              visibility: defaultVisibility,
              campaign_id: defaultCampaignId || null,
              folder_id: folderId,
              tags: note.tags,
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

      setSummary({
        imported: inserted.filter((n) => !n.error).length,
        failed: inserted.filter((n) => n.error),
        imagesUploaded: assetUrls.size,
        unresolvedLinks,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  const folders = Object.keys(folderCategory)

  return (
    <div className="dm-panel">
      <h2>Import Obsidian Vault</h2>
      <p className="view-subtitle">
        Select your vault folder. Each note's top-level folder picks its category below; every
        folder level beneath that is recreated as a nested folder here too, so General's sidebar
        mirrors your vault's structure. [[wikilinks]] between notes and ![[embedded images]] are
        resolved after import. Callouts and comments aren't converted — they'll come through as
        plain text.
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

          <p className="map-edit-hint">Map each vault folder to an entry category:</p>
          <div className="folder-category-list">
            {folders.map((folder) => (
              <label key={folder} className="folder-category-row">
                {folder}
                <select
                  value={folderCategory[folder]}
                  onChange={(e) =>
                    setFolderCategory((prev) => ({ ...prev, [folder]: e.target.value }))
                  }
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
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
                Imported {summary.imported} entries, uploaded {summary.imagesUploaded} images.
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
