// Converts an uncompressed draw.io export (File -> Export as -> XML..., with
// "Compressed" unchecked) into the JSON format the Skill Tree "Import JSON"
// button expects (see src/lib/skillTrees.js's treeToExportJson shape).
//
// Conventions this assumes about the diagram, based on a real exported tree:
// - Each node's label is either plain text ("Start Here") or stacked <div>
//   lines: the first line is the name, the last line is the cost IF it
//   looks like "<number>xp" (case-insensitive), and anything in between is
//   the description. No recognizable cost line just means cost 0 (used for
//   hub/branch nodes with nothing spent on them yet).
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
  if (!value.includes('<div')) return [value.trim()].filter(Boolean)
  const divs = [...value.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim()
  )
  return divs.filter(Boolean)
}

function parseNode(value) {
  const lines = textLines(value)
  if (lines.length === 0) return { name: '(untitled)', description: '', cost: 0 }
  const name = lines[0]
  if (lines.length === 1) return { name, description: '', cost: 0 }
  const last = lines[lines.length - 1]
  const costMatch = last.match(/^(\d+)\s*xp$/i)
  if (costMatch) {
    return { name, description: lines.slice(1, -1).join('\n'), cost: Number(costMatch[1]) }
  }
  return { name, description: lines.slice(1).join('\n'), cost: 0 }
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
    const { name, description, cost } = parseNode(v.value)
    return {
      localId: v.id,
      parentLocalId: parentByChild.get(v.id) ?? null,
      extraPrereqLocalIds: extraPrereqsByChild.get(v.id) ?? [],
      requireAllPrereqs: true,
      name,
      description,
      cost,
      sortOrder: 0,
    }
  })

const treeName = path.basename(inputPath).replace(/\.(drawio\.xml|drawio|xml)$/i, '')
writeFileSync(outputPath, JSON.stringify({ name: treeName, description: '', nodes }, null, 2))

const multiPrereqNodes = nodes.filter((n) => n.extraPrereqLocalIds.length > 0)
console.log(`Wrote ${nodes.length} nodes to ${outputPath}`)
console.log(`${nodes.filter((n) => !n.parentLocalId).length} root node(s) (no incoming arrow).`)
console.log(`${vertices.length - nodes.length} shape(s) skipped as decoration (no arrows touching them).`)
if (multiPrereqNodes.length > 0) {
  console.log(
    `${multiPrereqNodes.length} node(s) have more than one incoming arrow — defaulted to requiring ALL of them. ` +
      `Arrows can't express "any one is enough", so review these in DM Dashboard -> Skill Trees and flip ` +
      `"Require ALL prerequisites" off for any that should be an either/or:`
  )
  for (const n of multiPrereqNodes) console.log(`  - ${n.name}`)
}
