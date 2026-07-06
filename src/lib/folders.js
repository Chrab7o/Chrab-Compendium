// Folders are pure organization, not a security boundary — entries.visibility
// is still the only access control. For anonymous/player viewers, RLS has
// already filtered `entries` down to what they're allowed to see, so pruning
// folders that end up empty of visible content is just a recursive check
// against that already-filtered list, no extra security logic needed.
export function foldersWithVisibleContent(folders, entries) {
  const childrenByParent = new Map()
  for (const folder of folders) {
    const key = folder.parent_folder_id ?? 'root'
    if (!childrenByParent.has(key)) childrenByParent.set(key, [])
    childrenByParent.get(key).push(folder)
  }

  const entryCountByFolder = new Map()
  for (const entry of entries) {
    if (!entry.folder_id) continue
    entryCountByFolder.set(entry.folder_id, (entryCountByFolder.get(entry.folder_id) ?? 0) + 1)
  }

  const visible = new Set()
  function hasVisibleContent(folder) {
    let result = (entryCountByFolder.get(folder.id) ?? 0) > 0
    for (const child of childrenByParent.get(folder.id) ?? []) {
      if (hasVisibleContent(child)) result = true
    }
    if (result) visible.add(folder.id)
    return result
  }
  for (const folder of folders) hasVisibleContent(folder)
  return visible
}

export function childFolders(folders, parentId) {
  return folders
    .filter((f) => (f.parent_folder_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export function entriesInFolder(entries, folderId) {
  return entries
    .filter((e) => (e.folder_id ?? null) === folderId)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
}

// Entries directly in a category (folder_id null) — folder_id alone isn't
// enough to scope by category since top-level entries across every category
// all share folder_id === null.
export function topLevelEntries(entries, category) {
  return entriesInFolder(
    entries.filter((e) => e.category === category),
    null
  )
}

// Ancestor chain from root to `folderId`, for breadcrumbs.
export function folderPath(folders, folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path = []
  let current = folderId ? byId.get(folderId) : null
  while (current) {
    path.unshift(current)
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : null
  }
  return path
}

// Depth-first, indented so nesting is visible in a plain <select>.
export function flattenFolders(folders, category, parentId = null, depth = 0) {
  const options = []
  for (const folder of childFolders(folders.filter((f) => f.category === category), parentId)) {
    options.push({ id: folder.id, label: `${'—'.repeat(depth)} ${folder.name}`.trim() })
    options.push(...flattenFolders(folders, category, folder.id, depth + 1))
  }
  return options
}

// Combines each entry's primary location (its own category/folder_id) with
// any additional entry_placements rows, so browsing a folder shows entries
// placed there either way. __placementId is null for an entry's primary
// spot (reordering/moving it edits the entry itself) and set for an extra
// placement (edits that placement row instead) — everything downstream
// (entriesInFolder, topLevelEntries) just treats these as normal entries.
export function mergePlacements(entries, placements) {
  const entryById = new Map(entries.map((e) => [e.id, e]))
  const primary = entries.map((e) => ({ ...e, __placementId: null }))
  const extra = placements
    .map((p) => {
      const entry = entryById.get(p.entry_id)
      if (!entry) return null
      return {
        ...entry,
        category: p.category,
        folder_id: p.folder_id,
        sort_order: p.sort_order,
        __placementId: p.id,
      }
    })
    .filter(Boolean)
  return [...primary, ...extra]
}

// Every descendant folder id of `folderId`, used to block moving a folder
// into its own subtree.
export function descendantFolderIds(folders, folderId) {
  const ids = new Set()
  const stack = [folderId]
  while (stack.length) {
    const id = stack.pop()
    for (const f of folders) {
      if (f.parent_folder_id === id && !ids.has(f.id)) {
        ids.add(f.id)
        stack.push(f.id)
      }
    }
  }
  return ids
}
