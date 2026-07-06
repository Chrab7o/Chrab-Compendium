import { load as loadYaml } from 'js-yaml'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])

export function isImageFile(filename) {
  const ext = filename.split('.').pop()?.toLowerCase()
  return IMAGE_EXT.has(ext)
}

export function isMarkdownFile(filename) {
  return filename.toLowerCase().endsWith('.md')
}

export function basenameNoExt(filename) {
  const base = filename.split('/').pop()
  return base.replace(/\.[^.]+$/, '')
}

// Obsidian's vault-relative folder for a File, from webkitRelativePath
// ("VaultName/Folder/Sub/Note.md" -> "Folder"). Files directly in the
// vault root have no meaningful folder to categorize by. This is only used
// to pick which entry *category* a note lands in — folderSegments below
// carries the full nested path for building actual folders.
export function topFolder(relativePath) {
  const parts = relativePath.split('/')
  return parts.length > 2 ? parts[1] : '(root)'
}

// Every folder segment between the vault root and the filename, e.g.
// "Vault/Location/Region/Talmundre/Note.md" -> ["Location", "Region", "Talmundre"].
// The first segment is consumed for category selection (see topFolder);
// the rest become nested folders under that category.
export function folderSegments(relativePath) {
  const parts = relativePath.split('/')
  return parts.slice(1, -1)
}

export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { frontmatter: {}, body: text }
  let frontmatter = {}
  try {
    frontmatter = loadYaml(match[1]) ?? {}
  } catch {
    frontmatter = {}
  }
  return { frontmatter, body: text.slice(match[0].length) }
}

export function normalizeTags(frontmatter) {
  const raw = frontmatter.tags
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return raw.split(',').map((t) => t.trim()).filter(Boolean)
  return []
}

const WIKILINK_RE = /(!)?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g

// Two-pass resolution: call after every note has been inserted so
// `titleToId` and `assetUrls` are complete. `titleToId` keys are lowercased
// note titles; `assetUrls` keys are lowercased image filenames.
export function resolveWikilinks(body, titleToId, assetUrls) {
  const unresolved = []
  const resolved = body.replace(WIKILINK_RE, (full, bang, target, display) => {
    const key = target.trim().toLowerCase()
    if (bang) {
      const filename = key.split('/').pop()
      const url = assetUrls.get(filename)
      if (url) return `![${display ?? target}](${url})`
      const entryId = titleToId.get(basenameNoExt(filename))
      if (entryId) return `[${display ?? target}](#/entry/${entryId})`
      unresolved.push(target)
      return display ?? target
    }
    const entryId = titleToId.get(basenameNoExt(key))
    if (entryId) return `[${display ?? target}](#/entry/${entryId})`
    unresolved.push(target)
    return display ?? target
  })
  return { resolved, unresolved }
}
