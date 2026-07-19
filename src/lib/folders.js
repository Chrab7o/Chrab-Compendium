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

// A folder's own campaign_id if set, else the nearest ancestor's — same
// dynamic/computed approach as DM-only visibility: assigning a campaign to
// a folder is a single-row write, and everything nested inside picks it up
// automatically here rather than needing every descendant stamped with it.
// A folder/entry with its own explicit campaign_id always wins over an
// ancestor's, so a deeper exception is still possible.
export function effectiveFolderCampaignId(folders, folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]))
  let current = byId.get(folderId)
  while (current) {
    if (current.campaign_id) return current.campaign_id
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : null
  }
  return null
}

export function effectiveEntryCampaignId(folders, entry) {
  if (entry.campaign_id) return entry.campaign_id
  return entry.folder_id ? effectiveFolderCampaignId(folders, entry.folder_id) : null
}

// The current session's active scope, as a set of campaign ids to match
// against (or null for "no scope, show everything"). A specific campaign
// always wins; with just a world picked (no campaign chosen yet), it's
// every campaign belonging to that world — so entering a world narrows
// Locations/People/Search even before you've picked one of its campaigns.
export function scopedCampaignIds(campaigns, worldId, campaignId) {
  if (campaignId) return new Set([campaignId])
  if (worldId) return new Set(campaigns.filter((c) => c.world_id === worldId).map((c) => c.id))
  return null
}

// 'dm' if this folder or any ancestor is DM-only, else 'public' — mirrors
// the is_folder_public() RLS function (20260112000000_folder_visibility.sql)
// client-side, purely for display (badges), not as an access check: the
// database is still the real gate, this just lets the DM's own UI show
// what's actually hidden instead of only a folder's own literal flag.
export function effectiveFolderVisibility(folders, folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]))
  let current = folderId ? byId.get(folderId) : null
  while (current) {
    if (current.visibility === 'dm') return 'dm'
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : null
  }
  return 'public'
}

export function effectiveEntryVisibility(folders, entry) {
  if (entry.visibility === 'dm') return 'dm'
  return entry.folder_id ? effectiveFolderVisibility(folders, entry.folder_id) : 'public'
}

// Every tag on this folder plus every ancestor folder's tags, unioned —
// same computed-at-read-time approach as campaign_id/visibility, but
// additive (any ancestor's tag applies) rather than nearest-wins.
export function effectiveFolderTags(folders, folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const tags = new Set()
  let current = folderId ? byId.get(folderId) : null
  while (current) {
    for (const t of current.tags ?? []) tags.add(t)
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : null
  }
  return tags
}

export function effectiveEntryTags(folders, entry) {
  const tags = new Set(entry.tags ?? [])
  if (entry.folder_id) {
    for (const t of effectiveFolderTags(folders, entry.folder_id)) tags.add(t)
  }
  return [...tags]
}

// Every entry filed under `folderId` or any of its descendant folders,
// including extra placements — used by map regions to show "everything
// filed here" without reimplementing folder-tree walking a second time.
export function entriesUnderFolderTree(folders, entries, placements, folderId) {
  if (!folderId) return []
  const ids = new Set([folderId, ...descendantFolderIds(folders, folderId)])
  const merged = mergePlacements(entries, placements)
  return [...ids].flatMap((id) => entriesInFolder(merged, id))
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
