// Compile the shop generator's item pool out of a local 5etools source release.
//
// Usage: node extract.mjs [path-to-5etools-data-dir] [out-file]
//        (defaults: the Downloads copy this was first built against, and the
//        site's src/data/shop-items/pool.json)
//
// Reads items.json and writes the compiled pool straight into the site - unlike
// scripts/name-schemes, there is no download step to separate out, so there is
// no separate install step either. See README.md for why this reads a local
// release rather than 5e.tools itself.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.argv[2] ?? 'C:/Users/Cducl/Downloads/5etools-v2.36.1/data';
const outFile = process.argv[3] ?? join(here, '../../src/data/shop-items/pool.json');

// Sources whose items are setting-neutral: core rules and the "presented by"
// splatbooks, which describe magic items without tying them to one world. Every
// other source is a campaign setting (Ravnica, Eberron, Theros, Wildemount) or an
// adventure set in one (mostly the Forgotten Realms), and items from those drag
// in proper nouns that don't exist in this campaign.
const SETTING_NEUTRAL_SOURCES = [
  'XDMG', // Dungeon Master's Guide (2024)
  'TCE', // Tasha's Cauldron of Everything
  'BMT', // The Book of Many Things
  'BGG', // Bigby Presents: Glory of the Giants
  'FTD', // Fizban's Treasury of Dragons
  'XGE', // Xanathar's Guide to Everything
  'MTF', // Mordenkainen's Tome of Foes
];

const RARITIES = ['uncommon', 'rare', 'very rare', 'legendary'];

// ---- 5etools tag markup ----------------------------------------------------

// Tags look like {@tag text}, {@tag text|source} or {@tag text|source|display}.
// The last pipe-segment is what 5etools shows when there is more than one, so
// taking it (falling back to the first) reproduces the rendered text. 25 tag
// types occur across the item corpus and all follow this shape; the handful that
// carry real formatting are mapped to markdown instead of being flattened.
const EMPHASIS = { b: '**', bold: '**', i: '*', italic: '*' };

function stripTags(str) {
  // Innermost-first, because tags nest: {@item Bag of Holding|{@i x}}.
  let out = str;
  for (;;) {
    const next = out.replace(/\{@(\w+)([^{}]*)\}/g, (_, tag, rest) => {
      const parts = rest.replace(/^\s+/, '').split('|');
      const lower = tag.toLowerCase();
      if (EMPHASIS[lower]) return `${EMPHASIS[lower]}${parts[0]}${EMPHASIS[lower]}`;
      // {@dice 1d4} and friends have no display segment worth preferring.
      if (lower === 'dice' || lower === 'damage' || lower === 'hit' || lower === 'dc' || lower === 'chance') {
        return parts[0];
      }
      const display = parts.length > 2 ? parts[parts.length - 1] : parts[0];
      return display || parts[0];
    });
    if (next === out) return out;
    out = next;
  }
}

// ---- {#itemEntry Name|Source} ----------------------------------------------

// Items that share boilerplate don't repeat it: every Ioun Stone's entries are
// just a reference to one shared "Ioun Stone" template in items-base.json plus
// its own one-line benefit, and every Absorbing Tattoo is nothing but the
// reference. The template carries {{item.field}} placeholders filled from the
// referencing item, so "Force Absorbing Tattoo" resolves its own damage type.
//
// Leaving these unresolved silently drops most of an item's rules text, which
// is how this was found: a tattoo whose whole description was the marker.
const itemEntries = new Map()

function loadItemEntryTemplates(base) {
  for (const entry of base.itemEntry ?? []) {
    itemEntries.set(`${entry.name}|${entry.source}`.toLowerCase(), entry)
  }
}

/** ["acid"] -> "acid"; ["acid","cold","fire"] -> "acid, cold, and fire" */
function listify(value) {
  const parts = (Array.isArray(value) ? value : [value]).filter(Boolean).map(String)
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

// Substitution happens on the serialised template so it reaches placeholders at
// any depth; the replacement is JSON-escaped so a value containing a quote
// can't break the parse back.
function fillTemplate(template, item) {
  const filled = JSON.stringify(template).replace(/\{\{([^}]+)\}\}/g, (whole, expr) => {
    const trimmed = expr.trim()
    const field = trimmed.replace(/^getFullImmRes\s+/, '').replace(/^item\./, '')
    if (!(field in item)) return whole
    const value = item[field]
    const text = Array.isArray(value) ? listify(value) : String(value ?? '')
    return JSON.stringify(text).slice(1, -1)
  })
  return JSON.parse(filled)
}

// Splice the referenced template in wherever the marker appears, at any depth.
function resolveItemEntries(node, item) {
  if (typeof node === 'string') {
    const match = /^\{#itemEntry\s+([^|}]+)(?:\|([^}]*))?\}$/.exec(node.trim())
    if (!match) return node
    const [, name, source] = match
    const template = itemEntries.get(`${name}|${source || item.source}`.toLowerCase())
    if (!template) return node
    return resolveItemEntries(fillTemplate(template.entriesTemplate ?? [], item), item)
  }
  if (Array.isArray(node)) {
    // flatMap, so a marker standing alone in a list expands into its siblings
    // rather than becoming a nested array.
    return node.flatMap((child) => {
      const resolved = resolveItemEntries(child, item)
      return Array.isArray(resolved) ? resolved : [resolved]
    })
  }
  if (node && typeof node === 'object') {
    const out = { ...node }
    if (out.entries) out.entries = [].concat(resolveItemEntries(out.entries, item))
    if (out.items) out.items = [].concat(resolveItemEntries(out.items, item))
    return out
  }
  return node
}

// ---- entries -> markdown ---------------------------------------------------

// The player-facing page renders these with the same ReactMarkdown + remarkGfm
// that entry content already uses, so markdown is the target format rather than
// HTML or 5etools' own entry tree.
function renderTable(entry) {
  const head = (entry.colLabels ?? []).map((c) => stripTags(String(c)).trim());
  const rows = (entry.rows ?? []).map((row) =>
    (Array.isArray(row) ? row : row.row ?? []).map((cell) => renderCell(cell)),
  );
  if (head.length === 0 && rows.length === 0) return '';
  const width = Math.max(head.length, ...rows.map((r) => r.length), 1);
  const pad = (cells) => Array.from({ length: width }, (_, i) => cells[i] ?? '');
  const lines = [
    `| ${pad(head).join(' | ')} |`,
    `| ${pad([]).map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${pad(r).join(' | ')} |`),
  ];
  const caption = entry.caption ? `**${stripTags(entry.caption)}**\n\n` : '';
  return caption + lines.join('\n');
}

// Table cells must stay on one line - a newline inside a cell breaks the GFM
// table - and a literal pipe would end the cell early.
function renderCell(cell) {
  return render(cell).replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '\\|').trim();
}

function render(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string' || typeof entry === 'number') return stripTags(String(entry));
  if (Array.isArray(entry)) return entry.map(render).filter(Boolean).join('\n\n');

  switch (entry.type) {
    case 'list':
      return (entry.items ?? [])
        .map((item) => `- ${render(item).replace(/\n+/g, ' ')}`)
        .join('\n');
    case 'table':
      return renderTable(entry);
    case 'cell':
      // A roll range in a table cell: {min, max} or an exact value.
      if (entry.roll) {
        const { min, max, exact } = entry.roll;
        return exact != null ? String(exact) : `${min}-${max}`;
      }
      return render(entry.entries ?? entry.entry);
    case 'quote':
      return render(entry.entries)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    default: {
      // "entries", "item", "inset", "section" and untyped objects all carry an
      // optional name and a body. 5etools renders the name as a run-in bold
      // lead, which is also how the Item Maker writes its feature blocks.
      const body = render(entry.entries ?? entry.entry ?? entry.items ?? '');
      const name = entry.name ? stripTags(entry.name) : '';
      if (!name) return body;
      if (!body) return `**${name}.**`;
      // Keep the lead-in attached to the first paragraph only.
      const [first, ...rest] = body.split('\n\n');
      return [`**${name}.** ${first}`, ...rest].join('\n\n');
    }
  }
}

// ---- compile ---------------------------------------------------------------

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const neutral = new Set(SETTING_NEUTRAL_SOURCES);
const raw = JSON.parse(readFileSync(join(dataDir, 'items.json'), 'utf8'));
loadItemEntryTemplates(JSON.parse(readFileSync(join(dataDir, 'items-base.json'), 'utf8')));

const pool = raw.item
  .filter((it) => it.wondrous === true)
  .filter((it) => RARITIES.includes(it.rarity))
  // `reprintedAs` marks a printing that a later book supersedes - XDMG (2024)
  // reprints most of DMG (2014). Dropping these keeps exactly one copy of each
  // item, at its newest wording; without it a shop can stock "Bag of Holding"
  // twice from two different sources.
  .filter((it) => !it.reprintedAs)
  .filter((it) => neutral.has(it.source))
  .map((it) => ({
    key: `${slug(it.name)}|${it.source.toLowerCase()}`,
    name: it.name,
    source: it.source,
    rarity: it.rarity,
    // `reqAttune` is either absent, `true` ("requires attunement", no condition),
    // or a qualifier like "by a druid". Keep the boolean a boolean.
    attunement: it.reqAttune === true ? true : it.reqAttune ? stripTags(String(it.reqAttune)) : null,
    text: render(resolveItemEntries(it.entries ?? [], it)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(pool, null, '\t')}\n`, 'utf8');

const counts = RARITIES.map((r) => `${r}: ${pool.filter((i) => i.rarity === r).length}`);
console.log(`${outFile} <- ${pool.length} items (${counts.join(', ')})`);
