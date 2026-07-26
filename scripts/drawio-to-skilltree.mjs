// Converts an uncompressed draw.io export (File -> Export as -> XML..., with
// "Compressed" unchecked) into the JSON format the Skill Tree "Import JSON"
// button expects (see src/lib/skillTrees.js's treeToExportJson shape).
//
// Conventions this assumes about the diagram, based on a real exported tree:
// - Each node's label is a mix of plain text and <div>/<br> line breaks
//   (pasting rich HTML from elsewhere doesn't always land wrapped in a
//   fresh <div> per line, and earlier versions of this script silently
//   dropped any text that wasn't inside a <div> - including, critically,
//   a bare node name before the first <div>, or a bare sentence wedged
//   between two <div>s). textLines() now treats <div>/<br> as line breaks
//   over the whole label rather than only reading text found inside
//   <div>...</div>, so nothing outside a div goes missing.
// - The first line is the name. A line reading exactly "Requires <n>xp"
//   is the unlock cost - extracted into `cost` and removed from the
//   description. A line that mentions "<n>xp" but has more to it (e.g.
//   "Requires 4800xp and 4 Potions learned") still sets `cost`, but stays
//   in the description too since the extra requirement isn't otherwise
//   captured anywhere in the schema. A parenthetical "(Requires DC ##
//   ... to craft)" line marks the node `craftable: true` and is removed
//   entirely - the DC/hour-of-work crafting minigame this diagram
//   originally described has been replaced by a flat crafting XP cost,
//   noted once at the tree level rather than repeated per node.
// - Arrows point FROM a prerequisite TO the node it unlocks. A node with no
//   incoming arrow becomes a root (there can be more than one). Self-loop
//   arrows (source === target — happens by accident while editing in
//   draw.io) are ignored rather than treated as "its own prerequisite".
// - A shape with no arrows touching it at all (a title box, a stray text
//   label) is decoration, not a node, and is skipped automatically.
// - A node with more than one incoming arrow gets the first as its
//   structural parent (drives outline nesting) and the rest as extra
//   prerequisites, defaulted to "require ALL of them" since arrows can't
//   express either/or — flip that per-node in DM Dashboard -> Skill Trees
//   afterward for any that should only need one.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/drawio-to-skilltree.mjs <file.drawio.xml> [output.json]')
  process.exit(1)
}
const outputPath = process.argv[3] || inputPath.replace(/\.(drawio\.xml|drawio|xml)$/i, '') + '.skilltree.json'

const ENTITY_MAP = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' }
function decodeEntities(text) {
  return text.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (full, code) => {
    if (code[0] === '#') {
      const codePoint =
        code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return String.fromCodePoint(codePoint)
    }
    return ENTITY_MAP[code.toLowerCase()] ?? full
  })
}

function parseAttrs(tagContent) {
  const attrs = {}
  const re = /([\w-]+)="([^"]*)"/g
  let m
  // The label text is double-encoded (draw.io escapes its inner HTML, then
  // XML-escapes that again for the attribute) — e.g. "smaller&amp;nbsp;"
  // needs one pass to become "smaller&nbsp;" and a second to become
  // "smaller ". Decoding twice is a no-op for anything only encoded once.
  while ((m = re.exec(tagContent))) attrs[m[1]] = decodeEntities(decodeEntities(m[2]))
  return attrs
}

// Matches both self-closing <mxCell .../> and opening <mxCell ...> tags —
// we only need this tag's own attributes, not its nested <mxGeometry> child.
function extractCells(xml) {
  const cells = []
  const re = /<mxCell\s+([^>]*?)\/?>/g
  let m
  while ((m = re.exec(xml))) cells.push(parseAttrs(m[1]))
  return cells
}

function textLines(value) {
  if (!value) return []
  // <div> and <br> are the only line-break signals draw.io labels use -
  // converting both to newlines over the WHOLE label (rather than only
  // reading text found inside <div>...</div>) means bare text before the
  // first div, or wedged between two divs, is captured too instead of
  // silently vanishing.
  const withBreaks = value.replace(/<\/?div[^>]*>|<br\s*\/?>/gi, '\n')
  const plain = withBreaks.replace(/<[^>]+>/g, '')
  return plain
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

// A line that's *only* "Requires <n>xp" - the unlock cost, nothing else
// worth keeping in the description.
const CLEAN_XP_LINE_RE = /^requires\s*(\d+)\s*xp\s*$/i
// A line that mentions "<n>xp" but has more to it (e.g. "...and 4 Potions
// learned") - still the cost, but the extra requirement has nowhere else
// to live, so the line itself stays in the description too.
const LOOSE_XP_LINE_RE = /^requires\b.*?(\d+)\s*xp\b/i
// The old DC-check-and-hours-of-work crafting minigame, being replaced by
// a flat crafting XP cost - drop the line, mark the node as craftable.
const CRAFT_DC_LINE_RE = /^\(requires\s+dc\s+\d+.*\)$/i

function parseNode(value) {
  const lines = textLines(value)
  if (lines.length === 0) return { name: '(untitled)', description: '', cost: 0, craftable: false }
  const name = lines[0]

  let cost = 0
  let craftable = false
  const kept = []
  for (const line of lines.slice(1)) {
    if (CRAFT_DC_LINE_RE.test(line)) {
      craftable = true
      continue
    }
    const cleanMatch = line.match(CLEAN_XP_LINE_RE)
    if (cleanMatch) {
      cost = Number(cleanMatch[1])
      continue
    }
    const looseMatch = line.match(LOOSE_XP_LINE_RE)
    if (looseMatch) {
      cost = Number(looseMatch[1])
      kept.push(line)
      continue
    }
    kept.push(line)
  }
  return { name, description: kept.join('\n'), cost, craftable }
}

const xml = readFileSync(inputPath, 'utf8')
const cells = extractCells(xml)

const vertices = cells.filter((c) => c.vertex === '1' && c.id)
const edges = cells.filter((c) => c.edge === '1' && c.source && c.target && c.source !== c.target)

const touchedIds = new Set(edges.flatMap((e) => [e.source, e.target]))
// The first incoming arrow found becomes the structural parent (drives
// outline nesting); any further ones become extra prerequisites instead of
// being dropped, since a node can need more than one now.
const parentByChild = new Map()
const extraPrereqsByChild = new Map()
for (const e of edges) {
  if (!parentByChild.has(e.target)) {
    parentByChild.set(e.target, e.source)
    continue
  }
  if (!extraPrereqsByChild.has(e.target)) extraPrereqsByChild.set(e.target, [])
  extraPrereqsByChild.get(e.target).push(e.source)
}

const nodes = vertices
  .filter((v) => touchedIds.has(v.id))
  .map((v) => {
    const { name, description, cost, craftable } = parseNode(v.value)
    return {
      localId: v.id,
      parentLocalId: parentByChild.get(v.id) ?? null,
      extraPrereqLocalIds: extraPrereqsByChild.get(v.id) ?? [],
      requireAllPrereqs: true,
      name,
      description,
      cost,
      craftable,
      sortOrder: 0,
    }
  })

const treeName = path.basename(inputPath).replace(/\.(drawio\.xml|drawio|xml)$/i, '')
const craftableCount = nodes.filter((n) => n.craftable).length
// The old per-node "(Requires DC ## ...)" crafting text is stripped out by
// parseNode above (see its comment) and replaced by this one flat rule,
// noted once at the tree level instead of repeated on every craftable node.
const treeDescription =
  craftableCount > 0 ? 'Crafting a craftable item from this tree costs a flat 20xp, regardless of what it is.' : ''
writeFileSync(outputPath, JSON.stringify({ name: treeName, description: treeDescription, nodes }, null, 2))

const multiPrereqNodes = nodes.filter((n) => n.extraPrereqLocalIds.length > 0)
console.log(`Wrote ${nodes.length} nodes to ${outputPath}`)
console.log(`${nodes.filter((n) => !n.parentLocalId).length} root node(s) (no incoming arrow).`)
console.log(`${vertices.length - nodes.length} shape(s) skipped as decoration (no arrows touching them).`)
console.log(`${craftableCount} node(s) marked craftable (had a "(Requires DC ...)" crafting line).`)
if (multiPrereqNodes.length > 0) {
  console.log(
    `${multiPrereqNodes.length} node(s) have more than one incoming arrow — defaulted to requiring ALL of them. ` +
      `Arrows can't express "any one is enough", so review these in DM Dashboard -> Skill Trees and flip ` +
      `"Require ALL prerequisites" off for any that should be an either/or:`
  )
  for (const n of multiPrereqNodes) console.log(`  - ${n.name}`)
}
