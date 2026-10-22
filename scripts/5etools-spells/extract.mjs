// Compile the NPC Forge's spell catalog out of a local 5etools source release.
//
// Usage: node extract.mjs [path-to-5etools-data-dir] [out-file]
//        (defaults: the Downloads copy this was first built against, and the
//        site's src/data/spells/catalog.json)
//
// Every official source's spells, minus printings a later book supersedes
// (`reprintedAs` - so a spell reprinted in the 2024 PHB appears only as its
// XPHB version). Each spell is pre-processed by src/lib/fiveToolsSpells.js,
// the same code the editor uses on homebrew uploads, and carries 5etools'
// own Foundry data (spells/foundry.json) when it has activities for it.
// See README.md for provenance.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = process.argv[2] ?? 'C:/Users/Cducl/Downloads/5etools-v2.36.1/data'
const outFile = process.argv[3] ?? join(here, '../../src/data/spells/catalog.json')
const { prepareFiveToolsSpell } = await import(pathToFileURL(join(here, '../../src/lib/fiveToolsSpells.js')).href)

const spellDir = join(dataDir, 'spells')
const read = (file) => JSON.parse(readFileSync(join(spellDir, file), 'utf8'))
const index = read('index.json')
const sources = read('sources.json') // { SOURCE: { "Spell Name": { class: [{ name, source }] } } }
const foundry = new Map((read('foundry.json').spell ?? []).map((f) => [`${f.name}|${f.source}`.toLowerCase(), f]))

const raw = Object.values(index).flatMap((file) => read(file).spell ?? [])
const catalog = raw
  .filter((spell) => !spell.reprintedAs)
  .map((spell) => {
    const key = `${spell.name}|${spell.source}`.toLowerCase()
    const classes = [...new Set((sources[spell.source]?.[spell.name]?.class ?? []).map((c) => c.name))].sort()
    const f = foundry.get(key)
    const foundryData = f?.activities?.length ? { activities: f.activities, effects: f.effects ?? [] } : null
    return prepareFiveToolsSpell(spell, { foundry: foundryData, classes })
  })
  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, `${JSON.stringify(catalog)}\n`, 'utf8')
const withFoundry = catalog.filter((s) => s.foundry).length
console.log(`${outFile} <- ${catalog.length} spells (${withFoundry} with 5etools Foundry activities), from ${raw.length} printings`)
