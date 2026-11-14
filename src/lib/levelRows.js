// Feature rows edited by level: the class editor's Levels step (LevelsBoard).
//
// Rows stay in the flat shape the tables store (a sub-feature, or "option", is
// a row whose choice_group names its parent; see nestFeatureRows). These
// helpers take flat rows and return flat rows, nesting and flattening on the
// way, so the save path is unchanged.
//
// Every row gets a `ui_key` (not a column, never saved) so the panel can keep
// hold of the row it's editing while names and levels change. Rows loaded from
// the database key off their id; new ones get a fresh key.
import { flattenFeatureRows, nestFeatureRows } from './homebrew.js'

export const newKey = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

// A synthesized group (options whose intro feature doesn't exist yet) has no
// row of its own until it's edited: its key comes from its level and name.
export const rowKey = (row) => row.ui_key ?? (row.id && !String(row.id).startsWith('group:') ? `id:${row.id}` : `group:${row.level}:${String(row.name ?? '').trim()}`)

// Keys for rows that have none: the id, or the row's place (rows just imported).
// The same every call, so a key shown on screen still finds its row; edits
// write the keys into the rows, after which they stick.
export function ensureKeys(rows) {
  if (!rows?.length || rows.every((r) => r.ui_key)) return rows ?? []
  return rows.map((r, i) => (r.ui_key ? r : { ...r, ui_key: r.id && !String(r.id).startsWith('group:') ? `id:${r.id}` : `ix:${i}` }))
}

// Nested rows, each with its key, in the stored order.
export function levelRows(rows) {
  return nestFeatureRows(ensureKeys(rows)).map((node) => ({
    ...node,
    key: rowKey(node),
    children: node.children.map((c) => ({ ...c, key: rowKey(c) })),
  }))
}

// Back to flat. A synthesized group edited for the first time keeps the key it
// was shown with.
function flat(nested) {
  return flattenFeatureRows(
    nested.map(({ key, children, ...node }) => ({
      ...node,
      ui_key: node.ui_key ?? key,
      children: children.map(({ key: childKey, ...c }) => ({ ...c, ui_key: c.ui_key ?? childKey })),
    })),
  )
}

export function findRow(rows, key) {
  for (const node of levelRows(rows)) {
    if (node.key === key) return { row: node, parent: null }
    const child = node.children.find((c) => c.key === key)
    if (child) return { row: child, parent: node }
  }
  return null
}

// Features at each level: Map(level -> nested rows).
export function byLevel(rows) {
  const out = new Map()
  for (const node of levelRows(rows)) {
    if (!out.has(node.level)) out.set(node.level, [])
    out.get(node.level).push(node)
  }
  return out
}

export function addFeature(rows, fields = {}) {
  const key = newKey()
  const nested = levelRows(rows)
  nested.push({ level: 1, name: '', description: '', choice_group: '', choice_count: null, ...fields, ui_key: key, key, children: [] })
  return { rows: flat(nested), key }
}

// Patches a feature or an option. Renaming a feature keeps the later features
// that add their options to it ("add these to Dark Arts").
export function updateRow(rows, key, patch) {
  const nested = levelRows(rows)
  const target = nested.find((n) => n.key === key)
  if (target) {
    const from = String(target.name ?? '').trim()
    const renamed = patch.name !== undefined && from && patch.name.trim() !== from
    return flat(
      nested.map((n) =>
        n.key === key ? { ...n, ...patch } : renamed && n.choice_into === from ? { ...n, choice_into: patch.name.trim() } : n,
      ),
    )
  }
  return flat(nested.map((n) => ({ ...n, children: n.children.map((c) => (c.key === key ? { ...c, ...patch } : c)) })))
}

export function removeRow(rows, key) {
  return flat(levelRows(rows).filter((n) => n.key !== key).map((n) => ({ ...n, children: n.children.filter((c) => c.key !== key) })))
}

// Up or down among the features of the same level, or among a feature's options.
export function moveRow(rows, key, direction) {
  const nested = levelRows(rows)
  const swap = (list, i, j) => {
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  }
  const index = nested.findIndex((n) => n.key === key)
  if (index !== -1) {
    const level = nested[index].level
    const sameLevel = nested.map((n, i) => (n.level === level ? i : -1)).filter((i) => i !== -1)
    const at = sameLevel.indexOf(index)
    const other = sameLevel[at + direction]
    return other === undefined ? rows : flat(swap(nested, index, other))
  }
  return flat(
    nested.map((n) => {
      const i = n.children.findIndex((c) => c.key === key)
      const j = i + direction
      return i === -1 || j < 0 || j >= n.children.length ? n : { ...n, children: swap(n.children, i, j) }
    }),
  )
}

export function addOption(rows, parentKey, fields = {}) {
  const key = newKey()
  const next = flat(
    levelRows(rows).map((n) => (n.key === parentKey ? { ...n, children: [...n.children, { name: '', description: '', ...fields, level: n.level, ui_key: key, key }] } : n)),
  )
  return { rows: next, key }
}

// Earlier features with options that a feature at this level can add to.
export function earlierGroups(rows, key) {
  const nested = levelRows(rows)
  const row = nested.find((n) => n.key === key)
  if (!row) return []
  return nested.filter((n) => n.key !== key && n.children.length && !n.choice_into && n.name.trim() && n.level < row.level).map((n) => n.name.trim())
}

// The "Players" choice as one value: "0" all, "N" choose N, "into:<name>".
export const choiceValue = (row) => (row.choice_into ? `into:${row.choice_into}` : String(row.choice_count ?? 1))
export const choicePatch = (value) =>
  value.startsWith('into:') ? { choice_into: value.slice(5), choice_count: null, choice_swap: false } : { choice_into: '', choice_count: Number(value) }

// "pick 2 of 7", "all 3", "+4 to Dark Arts"
export function choiceSummary(row) {
  const n = row.children?.length ?? 0
  if (!n) return ''
  if (row.choice_into) return `+${n} to ${row.choice_into}`
  const count = row.choice_count ?? 1
  return count === 0 ? `all ${n}` : `pick ${count} of ${n}${row.choice_swap ? ', swappable' : ''}`
}
