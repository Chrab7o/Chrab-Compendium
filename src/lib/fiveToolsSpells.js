// 5etools spell data -> NPC Forge spells. Shared by the offline catalog
// compile (scripts/5etools-spells/extract.mjs, from a local 5etools release)
// and the editor's "import homebrew spells" upload, so both read 5etools the
// same way.
//
// Two steps:
//   prepareFiveToolsSpell(raw) - a 5etools spell object -> a compact record
//     (rules text already rendered to HTML, the bits the converter needs
//     pulled out). This is what the bundled catalog stores.
//   spellRecordToNpcSpell(record) - record -> an editor spell (foundryActorBuilder
//     emptyNpcSpell shape) with activities/effects guessed from 5etools'
//     tags (spellAttack, savingThrow, damageInflict, conditionInflict) or
//     taken from 5etools' own Foundry data (spells/foundry.json) when present.

import { changeFromFoundry, emptyActivity, emptyEffect, emptyNpcSpell } from './foundryActorBuilder.js'

export const SCHOOL_CODES = { A: 'abj', C: 'con', D: 'div', E: 'enc', V: 'evo', I: 'ill', N: 'nec', T: 'trs' }

const ABILITY_KEYS = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' }

// ---------------------------------------------------------------------------
// Tags and entries

// {@tag body|seg|seg}: dice-like tags show their first segment, scaled dice
// the per-level step ({@scaledamage 8d6|3-9|1d6} -> "1d6"), everything else
// the display segment 5etools renders (last of 3+, else first).
function tagText(tag, rest) {
  const parts = rest.replace(/^\s+/, '').split('|')
  const lower = tag.toLowerCase()
  if (['dice', 'damage', 'hit', 'd20', 'dc', 'chance', 'recharge'].includes(lower)) return parts[0]
  if (lower === 'scaledamage' || lower === 'scaledice') return parts[2] ?? parts[0]
  const display = parts.length > 2 ? parts[parts.length - 1] : parts[0]
  return display || parts[0]
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Innermost-first, because tags nest ({@i {@spell x}}).
export function stripTags(str, { html = false } = {}) {
  let out = html ? escapeHtml(str) : String(str)
  for (;;) {
    const next = out.replace(/\{@(\w+)([^{}]*)\}/g, (_, tag, rest) => {
      const lower = tag.toLowerCase()
      const text = tagText(tag, rest)
      if (html && (lower === 'b' || lower === 'bold')) return `<strong>${text}</strong>`
      if (html && (lower === 'i' || lower === 'italic')) return `<em>${text}</em>`
      return text
    })
    if (next === out) return out
    out = next
  }
}

export function entriesToHtml(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string' || typeof entry === 'number') return `<p>${stripTags(String(entry), { html: true })}</p>`
  if (Array.isArray(entry)) return entry.map(entriesToHtml).join('')
  switch (entry.type) {
    case 'list':
      return `<ul>${(entry.items ?? []).map((i) => `<li>${entriesToHtml(i).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>`
    case 'table': {
      const head = (entry.colLabels ?? []).map((c) => `<th>${stripTags(String(c), { html: true })}</th>`).join('')
      const rows = (entry.rows ?? [])
        .map((row) => `<tr>${(Array.isArray(row) ? row : row.row ?? []).map((c) => `<td>${cellText(c)}</td>`).join('')}</tr>`)
        .join('')
      const caption = entry.caption ? `<caption>${stripTags(entry.caption, { html: true })}</caption>` : ''
      return `<table>${caption}${head ? `<thead><tr>${head}</tr></thead>` : ''}<tbody>${rows}</tbody></table>`
    }
    case 'quote':
      return `<blockquote>${entriesToHtml(entry.entries)}</blockquote>`
    default: {
      // entries / inset / section / item: an optional run-in bold name.
      const body = entriesToHtml(entry.entries ?? entry.entry ?? entry.items ?? '')
      if (!entry.name) return body
      const name = `<strong>${stripTags(entry.name, { html: true })}.</strong>`
      return body.startsWith('<p>') ? body.replace('<p>', `<p>${name} `) : `<p>${name}</p>${body}`
    }
  }
}

function cellText(cell) {
  if (cell && typeof cell === 'object' && cell.type === 'cell' && cell.roll) {
    const { min, max, exact } = cell.roll
    return exact != null ? String(exact) : `${min}–${max}`
  }
  return entriesToHtml(cell).replace(/<\/?p>/g, ' ').trim()
}

function entriesToText(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string' || typeof entry === 'number') return stripTags(String(entry))
  if (Array.isArray(entry)) return entry.map(entriesToText).join('\n')
  return entriesToText(entry.entries ?? entry.entry ?? entry.items ?? '')
}

// ---------------------------------------------------------------------------
// Raw 5etools spell -> compact record

function firstTag(entries, tags) {
  const json = JSON.stringify(entries ?? [])
  const m = json.match(new RegExp(`\\{@(?:${tags.join('|')}) ([^|}]+)`, 'i'))
  return m ? m[1].trim() : ''
}

// "{@scaledamage 8d6|3-9|1d6}" -> "1d6": what each slot level above adds.
function upcastStep(entriesHigherLevel) {
  const json = JSON.stringify(entriesHigherLevel ?? [])
  const m = json.match(/\{@scale(?:damage|dice) [^|}]+\|[^|}]+\|([^|}]+)\}/i)
  return m ? m[1].trim() : ''
}

export function prepareFiveToolsSpell(raw, { foundry = null, classes = [] } = {}) {
  const text = entriesToText(raw.entries)
  return {
    key: `${raw.name}|${raw.source}`.toLowerCase(),
    name: raw.name,
    source: raw.source ?? '',
    page: raw.page ?? null,
    level: raw.level ?? 0,
    school: SCHOOL_CODES[raw.school] ?? 'evo',
    time: raw.time ?? [],
    range: raw.range ?? null,
    components: raw.components ?? {},
    duration: raw.duration ?? [],
    ritual: !!raw.meta?.ritual,
    html: entriesToHtml(raw.entries),
    higherHtml: entriesToHtml(raw.entriesHigherLevel),
    damage: firstTag(raw.entries, ['damage']),
    dice: firstTag(raw.entries, ['dice']),
    upcast: upcastStep(raw.entriesHigherLevel),
    halfOnSave: /half as much damage/i.test(text),
    addsMod: /spellcasting ability modifier/i.test(text),
    damageInflict: raw.damageInflict ?? [],
    savingThrow: raw.savingThrow ?? [],
    spellAttack: raw.spellAttack ?? [],
    conditionInflict: raw.conditionInflict ?? [],
    healing: (raw.miscTags ?? []).includes('HL'),
    areaTags: raw.areaTags ?? [],
    classes,
    foundry,
  }
}

// ---------------------------------------------------------------------------
// Record -> editor spell

const RANGE_UNITS = { feet: 'ft', miles: 'mi', self: 'self', touch: 'touch', sight: 'spec', unlimited: 'any' }
const AREA_TYPES = { radius: 'radius', sphere: 'sphere', cone: 'cone', line: 'line', cube: 'cube', hemisphere: 'sphere', emanation: 'radius', cylinder: 'cylinder' }
const DURATION_UNITS = { round: 'round', minute: 'minute', hour: 'hour', day: 'day', turn: 'turn' }
const TIME_UNITS = { action: 'action', bonus: 'bonus', reaction: 'reaction', minute: 'minute', hour: 'hour' }

function rangeAndArea(range) {
  const out = { range: { value: '', units: 'self' }, area: { type: '', size: '' } }
  if (!range) return out
  const dist = range.distance ?? {}
  if (range.type === 'point') {
    out.range = { value: dist.amount != null ? String(dist.amount) : '', units: RANGE_UNITS[dist.type] ?? 'spec' }
  } else if (AREA_TYPES[range.type]) {
    // "Self (20-foot cone)" style: the area starts at the caster.
    out.area = { type: AREA_TYPES[range.type], size: dist.amount != null ? String(dist.amount) : '' }
  } else {
    out.range = { value: '', units: 'spec' }
  }
  return out
}

function durationOf(duration) {
  const d = duration?.[0] ?? { type: 'instant' }
  if (d.type === 'timed') return { value: String(d.duration?.amount ?? 1), units: DURATION_UNITS[d.duration?.type] ?? 'minute', concentration: !!d.concentration }
  if (d.type === 'permanent') return { value: '', units: 'perm', concentration: false }
  if (d.type === 'special') return { value: '', units: 'spec', concentration: false }
  return { value: '', units: 'inst', concentration: false }
}

// The area a spell's text names ("20-foot-radius Sphere") when its range is a
// point - Fireball is range 150 ft. with an area at the point.
function areaFromText(html) {
  const m = String(html).match(/(\d+)-foot(?:-radius)?[\s-]+(?:<[^>]+>)?\s*(Sphere|Cone|Cube|Line|Cylinder|Emanation|radius)/i)
  if (!m) return null
  const type = AREA_TYPES[m[2].toLowerCase()] ?? 'radius'
  return { type, size: m[1] }
}

function damageRow(formula, types) {
  return { formula, types: types?.length ? [types[0]] : [] }
}

export function spellRecordToNpcSpell(record) {
  const spell = emptyNpcSpell()
  const time = record.time?.[0] ?? { number: 1, unit: 'action' }
  const { range, area } = rangeAndArea(record.range)
  const textArea = !area.type && record.range?.type === 'point' ? areaFromText(record.html) : null
  const dur = durationOf(record.duration)
  const m = record.components?.m

  Object.assign(spell, {
    name: record.name,
    level: record.level ?? 0,
    school: record.school ?? 'evo',
    activation: { type: TIME_UNITS[time.unit] ?? 'action', value: time.number ?? 1, condition: time.condition ?? '' },
    range,
    area: textArea ?? area,
    duration: { value: dur.value, units: dur.units },
    concentration: dur.concentration,
    ritual: !!record.ritual,
    components: { v: !!record.components?.v, s: !!record.components?.s, m: !!m },
    materials: typeof m === 'string' ? m : m?.text ?? '',
    description: `${record.html ?? ''}${record.higherHtml ?? ''}`,
    upcast: record.upcast ?? '',
    source: { book: record.source ?? '', page: record.page != null ? String(record.page) : '' },
    fiveTools: record.key ?? '',
  })

  // 5etools' own Foundry data (what Plutonium imports) wins when it has
  // activities - it knows things the tags don't (Hold Person's paralysis).
  const fromFoundry = foundryActivities(record, spell)
  if (fromFoundry) return fromFoundry

  const types = record.damageInflict ?? []
  const damage = record.damage ? [damageRow(record.damage, types)] : []
  const effects = (record.conditionInflict ?? []).length
    ? [{ ...emptyEffect(), name: record.name, statuses: record.conditionInflict.filter(Boolean) }]
    : []

  if (record.spellAttack?.length) {
    spell.activities = [{ ...emptyActivity('attack'), attackType: record.spellAttack[0] === 'M' ? 'melee' : 'ranged', classification: 'spell', damage }]
  } else if (record.savingThrow?.length) {
    spell.activities = [
      {
        ...emptyActivity('save'),
        saveAbility: ABILITY_KEYS[record.savingThrow[0]] ?? 'dex',
        dcAbility: 'spellcasting',
        onSave: record.halfOnSave ? 'half' : 'none',
        damage,
      },
    ]
  } else if (record.healing && (record.dice || record.damage)) {
    const base = record.dice || record.damage
    spell.activities = [{ ...emptyActivity('heal'), healing: record.addsMod ? `${base} + @mod` : base }]
  } else if (damage.length) {
    spell.activities = [{ ...emptyActivity('damage'), damage }]
  } else {
    spell.activities = [{ ...emptyActivity('utility') }]
  }
  spell.effects = effects
  return spell
}

function balanced(formula) {
  let depth = 0
  for (const ch of formula) {
    if (ch === '(') depth++
    if (ch === ')' && --depth < 0) return false
  }
  return depth === 0
}

// {number: 1, denomination: 4, bonus: "1"} -> "1d4 + 1"
function partFormula(p) {
  const dice = p.number && p.denomination ? `${p.number}d${p.denomination}` : ''
  const bonus = String(p.bonus ?? '').trim()
  if (!bonus) return dice
  if (!dice) return bonus
  return bonus.startsWith('-') ? `${dice} - ${bonus.slice(1).trim()}` : `${dice} + ${bonus.replace(/^\+\s*/, '')}`
}

function foundryActivities(record, spell) {
  const acts = record.foundry?.activities
  if (!acts?.length) return null
  const effects = (record.foundry.effects ?? []).map((e) => ({
    ...emptyEffect(),
    name: e.name ?? record.name,
    statuses: e.statuses ?? [],
    // 5etools writes mode as a word ("ADD"); the v14 type is the same word lowercased.
    changes: (e.changes ?? []).map((c) => changeFromFoundry({ key: c.key, value: c.value, type: typeof c.mode === 'string' ? c.mode.toLowerCase() : undefined, mode: typeof c.mode === 'number' ? c.mode : undefined })),
    foundryId: e.foundryId ?? '',
  }))
  const types = record.damageInflict ?? []
  spell.activities = acts.map((a) => {
    const kind = ['attack', 'save', 'damage', 'heal', 'utility'].includes(a.type) ? a.type : 'utility'
    const activity = { ...emptyActivity(kind), name: a.name ?? '' }
    if (kind === 'attack') {
      activity.classification = 'spell'
      activity.attackType = a.attack?.type?.value === 'melee' || record.spellAttack?.[0] === 'M' ? 'melee' : 'ranged'
    }
    if (kind === 'save') {
      activity.saveAbility = a.save?.ability?.[0] ?? ABILITY_KEYS[record.savingThrow?.[0]] ?? 'dex'
      activity.dcAbility = 'spellcasting'
      activity.onSave = a.damage?.onSave ?? (record.halfOnSave ? 'half' : 'none')
    }
    // A malformed formula in 5etools' data (Armor of Agathys has an unclosed
    // bracket) would fail Foundry's import validation; fall back to the text.
    const parts = a.damage?.parts?.length
      ? a.damage.parts.map((p) => damageRow(p.custom?.formula || partFormula(p), p.types)).filter((r) => r.formula && balanced(r.formula))
      : null
    if (['attack', 'save', 'damage'].includes(kind)) activity.damage = parts ?? (record.damage ? [damageRow(record.damage, types)] : [])
    if (kind === 'heal') activity.healing = a.healing?.custom?.formula || record.dice || record.damage || ''
    activity.effectRefs = (a.effects ?? []).map((ref) => ref.foundryId).filter(Boolean)
    return activity
  })
  // Effects that only some activities apply: their foundryId refs -> appliedBy keys.
  spell.effects = effects.map(({ foundryId, ...e }) => {
    const users = spell.activities.filter((a) => a.effectRefs?.includes(foundryId)).map((a) => a.key)
    return { ...e, appliedBy: users.length && users.length < spell.activities.length ? users : [] }
  })
  spell.activities = spell.activities.map(({ effectRefs, ...a }) => a)
  return spell
}

// A 5etools file the user uploads: a homebrew file ({ spell: [...] }), one
// of 5etools' own spells-*.json files, a bare array, or a single spell.
export function fiveToolsSpellList(json) {
  if (Array.isArray(json)) return json.filter((s) => s?.name && s.level != null)
  if (Array.isArray(json?.spell)) return json.spell
  if (json?.name && json.level != null) return [json]
  return []
}

