// Feature Forge: single Foundry items (class features, feats, spells) built on
// the site and sent to the world's Items directory through Chrab Sync,
// independent of any NPC. A spec wraps the same item / spell shapes the NPC
// Forge edits, so rolls, effects, midi-qol automation and behaviors
// (foundryBehaviors.js) all work the same way here.
//
// The difference from an NPC's items: these end up on player characters, so
// nothing is baked from a statblock. Formulas stay as @references that
// resolve against whoever owns the item, and the generated description reads
// the behaviors in words instead of printing an NPC's to-hit and damage.

import {
  buildNpcItem,
  buildNpcSpellItem,
  emptyNpcItem,
  emptyNpcSpec,
  emptyNpcSpell,
  foundryItemToNpcItem,
  emptyChange,
  emptyEffect,
  foundrySpellToNpcSpell,
  textToHtml,
} from './foundryActorBuilder.js'
import { behaviorSummary, deathStanceBehavior } from './foundryBehaviors.js'
import { descriptionHtml, emptyTextBlock, hasDescription } from './itemDescription.js'

export const FEATURE_KINDS = [
  { key: 'feat', label: 'Feature' },
  { key: 'spell', label: 'Spell' },
  { key: 'gear', label: 'Magic item / gear' },
]

// Gear (kind 'gear'): weapons, armor, wondrous items and consumables, with
// the same rolls, effects and behaviors as a feature plus spec.gear below.
// key: the Item Forge's kind; type: the dnd5e item type it builds; subtypes:
// dnd5e system.type.value.
export const GEAR_TYPES = [
  {
    key: 'weapon',
    label: 'Weapon',
    help: 'A sword, a bow, a staff you hit with.',
    type: 'weapon',
    subtypes: [
      ['martialM', 'Martial melee'],
      ['simpleM', 'Simple melee'],
      ['martialR', 'Martial ranged'],
      ['simpleR', 'Simple ranged'],
    ],
  },
  {
    key: 'armor',
    label: 'Armor or shield',
    help: 'Worn for AC.',
    type: 'equipment',
    subtypes: [
      ['light', 'Light armor'],
      ['medium', 'Medium armor'],
      ['heavy', 'Heavy armor'],
      ['shield', 'Shield'],
    ],
  },
  {
    key: 'wondrous',
    label: 'Wondrous item',
    help: 'A cloak, an amulet, a ring, a wand: worn or carried.',
    type: 'equipment',
    subtypes: [
      ['trinket', 'Wondrous item'],
      ['ring', 'Ring'],
      ['rod', 'Rod'],
      ['wand', 'Wand'],
      ['clothing', 'Clothing'],
    ],
  },
  {
    key: 'consumable',
    label: 'Consumable',
    help: 'A potion, scroll or bomb: used up.',
    type: 'consumable',
    subtypes: [
      ['potion', 'Potion'],
      ['scroll', 'Scroll'],
      ['ammo', 'Ammunition'],
      ['food', 'Food'],
      ['poison', 'Poison'],
      ['trinket', 'Other'],
    ],
  },
]

// dnd5e system.rarity
export const RARITIES = [
  ['', 'Not set'],
  ['common', 'Common'],
  ['uncommon', 'Uncommon'],
  ['rare', 'Rare'],
  ['veryRare', 'Very rare'],
  ['legendary', 'Legendary'],
  ['artifact', 'Artifact'],
]

// dnd5e weapon properties (system.properties), the ones a custom weapon picks.
export const WEAPON_PROPERTIES = [
  ['fin', 'Finesse'],
  ['lgt', 'Light'],
  ['hvy', 'Heavy'],
  ['two', 'Two-handed'],
  ['ver', 'Versatile'],
  ['rch', 'Reach'],
  ['thr', 'Thrown'],
  ['amm', 'Ammunition'],
  ['lod', 'Loading'],
]

export function emptyGear(key = 'wondrous') {
  const type = GEAR_TYPES.find((t) => t.key === key) ?? GEAR_TYPES[2]
  return {
    type: type.key,
    subtype: type.subtypes[0][0],
    baseItem: '', // dnd5e base item id, e.g. "longsword" (optional)
    rarity: 'uncommon',
    attunement: false,
    weight: '',
    magicalBonus: '', // weapons and armor: +1, +2, +3
    properties: [], // weapons: WEAPON_PROPERTIES keys
    armorValue: '', // armor: base AC (shield: the bonus)
    dexCap: '', // medium armor: 2; blank = no cap (light) - heavy ignores DEX
    strength: '', // heavy armor's Strength requirement
    stealthDisadvantage: false,
    autoDestroy: true, // consumables: gone when the last charge is used
    blocks: [emptyTextBlock()], // the written description (itemDescription.js)
    source: null, // { itemMaker: id } for items imported from the old Item Maker
  }
}

export const gearType = (spec) => GEAR_TYPES.find((t) => t.key === spec?.gear?.type) ?? GEAR_TYPES[2]
export const rarityLabel = (key) => RARITIES.find(([k]) => k === key)?.[1] ?? ''

// dnd5e feat item system.type.value
export const FEAT_TYPES = [
  { key: 'class', label: 'Class feature' },
  { key: 'feat', label: 'Feat' },
  { key: 'race', label: 'Species trait' },
  { key: 'background', label: 'Background feature' },
  { key: 'monster', label: 'Monster feature' },
]

// The draft flag Chrab Sync matches world items on, scoped to its module id
// like npcDraftId (getFlag only accepts active package scopes).
export const FEATURE_DRAFT_FLAG = 'featureDraftId'

// A stand-in owner for the builder's NPC-shaped math. Only used for things
// Foundry recomputes from the real owner anyway; descriptions never print it.
// formulasAsIs: over-time strings keep their @references for the real owner
// instead of baking this stand-in's numbers.
const NEUTRAL_OWNER = { ...emptyNpcSpec(), name: 'you', formulasAsIs: true }

export function emptyFeatureSpec(kind = 'feat') {
  return {
    kind,
    featType: 'class',
    requirements: '', // "Fighter 3", shown under the name on the sheet
    item: { ...emptyNpcItem('action'), activities: [], ...(kind === 'gear' ? { section: 'trait', magical: true } : {}) },
    spell: { ...emptyNpcSpell(), method: 'slots' },
    gear: emptyGear(),
  }
}

// A stored spec (feature_drafts.spec) over today's defaults, so drafts saved
// before a field existed still build.
export function featureSpecFromRow(stored) {
  const base = emptyFeatureSpec(stored?.kind)
  return { ...base, ...stored, item: { ...base.item, ...stored?.item }, spell: { ...base.spell, ...stored?.spell }, gear: { ...base.gear, ...stored?.gear } }
}

// ---------------------------------------------------------------------------
// Mechanics edited from a homebrew class's feature row (ClassWizard /
// StandaloneSubclassEditor). The row owns the words; the draft owns the
// mechanics. classFeatureSpec is the draft as it should be saved for that row.

const classSlug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

// "The Dark Knight 3 (Harbinger of Darkness)"
export function classFeatureRequirements({ className, level, subclassName }) {
  return [className, level].filter(Boolean).join(' ') + (subclassName ? ` (${subclassName})` : '')
}

// ctx: { className, subclassName, level, name, description }
export function classFeatureSpec(stored, ctx) {
  const spec = featureSpecFromRow(stored)
  const behavior = spec.item.behavior
  return {
    ...spec,
    kind: 'feat',
    featType: 'class',
    requirements: classFeatureRequirements(ctx),
    item: {
      ...spec.item,
      name: String(ctx.name ?? '').trim(),
      description: String(ctx.description ?? ''),
      // Level tiers count the class the feature belongs to (dnd5e identifiers
      // are the slugged name, "Cleric" -> "cleric"), unless set by hand.
      behavior: behavior && !behavior.levelClass ? { ...behavior, levelClass: classSlug(ctx.className) } : behavior,
    },
  }
}

// Whether saving the row would change the stored draft's words.
export function classFeatureTextChanged(stored, ctx) {
  const want = classFeatureSpec(stored, ctx)
  const have = featureSpecFromRow(stored)
  return want.item.name !== have.item.name || want.item.description !== have.item.description || want.requirements !== have.requirements || want.item.behavior?.levelClass !== have.item.behavior?.levelClass
}

// "2 rolls · 1 effect · toggle · @prof per long rest"
export function mechanicsSummary(spec) {
  const item = spec?.item ?? {}
  const n = (count, word) => (count ? `${count} ${word}${count === 1 ? '' : 's'}` : '')
  const recovery = { lr: 'per long rest', sr: 'per short rest', day: 'per day', dawn: 'per dawn', dusk: 'per dusk', none: 'charges', recharge: 'recharge' }[item.usesRecovery]
  const behavior = item.behavior ? (item.behavior.mode === 'toggle' ? 'toggle' : 'always-on rules') : ''
  return [
    n(item.activities?.length, 'roll'),
    n(item.effects?.length, 'effect'),
    behavior,
    item.behavior?.rules?.length ? n(item.behavior.rules.length, 'rule') : '',
    recovery && (item.usesRecovery === 'recharge' ? `recharge ${item.rechargeOn}-6` : `${item.usesMax || '?'} ${recovery}`),
    item.identifier ? `pool “${item.identifier}”` : '',
    ...(item.activities ?? []).flatMap((a) => (a.spend ?? []).filter((s) => s.source === 'pool' && s.target).map((s) => `spends ${s.amount || 1} ${s.target}${s.extra ? '+' : ''}`)),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function featureName(spec) {
  return (spec?.kind === 'spell' ? spec.spell?.name : spec?.item?.name) || ''
}

// Behaviors read as rules text; rolls are left to the sheet, which shows the
// owner's real numbers.
function featureDescription(item) {
  const own = textToHtml(item.description)
  if (own) return own
  const text = behaviorSummary(item.behavior, item.name)
  return text ? `<p>${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</p>` : ''
}

// Gear: the feature build (rolls, effects, behaviors) turned into a weapon,
// equipment or consumable item with its rarity, attunement and stats.
function buildGearItem(spec) {
  const gear = spec.gear ?? emptyGear()
  const type = gearType(spec)
  const item = spec.item
  const built = buildNpcItem(NEUTRAL_OWNER, { ...item, itemType: 'feat' })
  const props = new Set(item.magical ? ['mgc'] : [])
  const bonus = Number(String(gear.magicalBonus ?? '').replace('+', '')) || null
  const sys = {
    ...built.system,
    type: { value: gear.subtype || type.subtypes[0][0], baseItem: gear.baseItem || '' },
    rarity: gear.rarity || '',
    attunement: gear.attunement ? 'required' : '',
    attuned: false,
    equipped: false,
    identified: true,
    quantity: 1,
    weight: { value: Number(gear.weight) || 0, units: 'lb' },
    price: { value: 0, denomination: 'gp' },
    description: { value: hasDescription(gear.blocks) ? descriptionHtml(gear.blocks) : featureDescription(item), chat: '' },
  }
  if (type.key === 'weapon') {
    for (const p of gear.properties ?? []) props.add(p)
    // The weapon's own damage, from its first attack's first damage part ("1d8 + @mod").
    const attack = (item.activities ?? []).find((a) => a.kind === 'attack')
    const part = attack?.damage?.find((d) => /^\s*\d+d\d+/.test(d.formula ?? ''))
    const [, number, die] = String(part?.formula ?? '').match(/(\d+)d(\d+)/) ?? []
    const noDamage = { types: [], custom: { enabled: false }, scaling: { number: 1 } }
    Object.assign(sys, {
      magicalBonus: bonus,
      proficient: null,
      damage: {
        base: number ? { ...noDamage, number: Number(number), denomination: Number(die), types: part.types ?? [] } : noDamage,
        versatile: noDamage,
      },
      range:
        attack?.attackType === 'ranged'
          ? { value: Number(attack.range) || 30, long: Number(attack.longRange) || null, units: 'ft' }
          : { value: null, long: null, reach: (gear.properties ?? []).includes('rch') ? 10 : null, units: 'ft' },
    })
  } else if (type.key === 'armor') {
    if (gear.stealthDisadvantage) props.add('stealthDisadvantage')
    const dex = gear.subtype === 'heavy' ? 0 : String(gear.dexCap ?? '').trim() ? Number(gear.dexCap) : null
    Object.assign(sys, {
      armor: { value: Number(gear.armorValue) || (gear.subtype === 'shield' ? 2 : 10), dex, magicalBonus: bonus },
      strength: Number(gear.strength) || null,
      proficient: null,
    })
  } else if (type.key === 'consumable') {
    // A consumable with no uses set is used once.
    const once = !item.usesMax && item.usesRecovery !== 'recharge'
    sys.uses = { ...(once ? { max: '1', spent: 0, recovery: [] } : sys.uses), autoDestroy: gear.autoDestroy !== false }
  }
  sys.properties = [...props]
  return { ...built, type: type.type, img: item.img || built.img, system: sys }
}

export function buildFeatureItem(spec, { draftId = null } = {}) {
  let built
  if (spec.kind === 'gear') {
    built = buildGearItem(spec)
  } else if (spec.kind === 'spell') {
    built = buildNpcSpellItem(NEUTRAL_OWNER, { ...spec.spell, method: 'slots' })
    // A player's spell: cast with slots (or at will for a cantrip), and left
    // unprepared until the player prepares it.
    built.system.method = 'spell'
    built.system.prepared = 0
    built.system.description = { value: textToHtml(spec.spell.description), chat: '' }
  } else {
    built = buildNpcItem(NEUTRAL_OWNER, { ...spec.item, itemType: 'feat' })
    built.system.type = { value: spec.featType || 'class', subtype: '' }
    built.system.requirements = String(spec.requirements ?? '')
    built.system.description = { value: featureDescription(spec.item), chat: '' }
  }
  if (draftId) {
    built.flags = { ...built.flags, 'chrab-sync': { ...built.flags?.['chrab-sync'], [FEATURE_DRAFT_FLAG]: draftId } }
  }
  return built
}

// A Foundry item export (right-click -> Export Data) -> spec, so homebrew
// already in the world can be edited here.
export function featureItemToSpec(item) {
  if (item?.type === 'spell') {
    return { ...emptyFeatureSpec('spell'), spell: { ...foundrySpellToNpcSpell(item), method: 'slots' } }
  }
  if (['weapon', 'equipment', 'consumable', 'loot'].includes(item?.type)) return gearItemToSpec(item)
  if (item?.type !== 'feat') throw new Error('That file is not a Foundry feature, spell or item export.')
  const spec = emptyFeatureSpec('feat')
  spec.featType = item.system?.type?.value || 'class'
  spec.requirements = item.system?.requirements ?? ''
  spec.item = foundryItemToNpcItem(item)
  return spec
}

// ---------------------------------------------------------------------------
// Templates: ready-made features to start from.

// The Dark Knight's own wording (homebrew_subclass_features, Harbinger of
// Darkness levels 3 and 7), so the sheet reads like the class page.
const DEATH_STANCE_TEXT = `As a bonus action, let the darkness consume you to enter a death stance for one minute. In this state you gain advantage on attack rolls. On hit you may roll 1d10 and deal that much additional necrotic damage, but you take that amount of damage as well. On a critical hit, restore 1d10 + your Constitution modifier hp. The first time you would go down while in this state, you may expend a hit die to get back up with that much hp instead; you do not lose Death Stance if you do. You can use this feature a number of times equal to your proficiency bonus.

Death Archetype Upgrade (level 7): In your death stance you now heal when rolling a 19 or 20 on the die. Your healing increases to 2d10 + your Constitution modifier.`

export const FEATURE_TEMPLATES = [
  {
    key: 'deathStance',
    label: 'Death Stance',
    help: 'Dark Knight (Harbinger of Darkness) 3. A 1-minute bonus-action stance with advantage on attacks and a blood-red aura. Melee crits heal 1d10 + CON (19-20 for 2d10 + CON from level 7); a melee hit can add 1d10 necrotic at the cost of the same damage to you; the first time you would drop, spend a hit die to stay up.',
    build: () => {
      const spec = emptyFeatureSpec('feat')
      spec.requirements = 'Dark Knight 3 (Harbinger of Darkness)'
      spec.item = {
        ...spec.item,
        name: 'Death Stance',
        section: 'bonus',
        img: 'icons/svg/skull.svg',
        description: DEATH_STANCE_TEXT,
        usesMax: '@prof',
        usesRecovery: 'lr',
        effects: [{ ...emptyEffect(), name: 'Death Stance', stance: true, changes: [emptyChange('advAttack')] }],
        behavior: deathStanceBehavior(),
      }
      return spec
    },
  },
]

// A Foundry weapon / equipment / consumable export -> a gear spec. The
// description comes back as the item's own text, not as blocks.
function gearItemToSpec(item) {
  const sys = item.system ?? {}
  const subtype = sys.type?.value ?? ''
  const armorTypes = ['light', 'medium', 'heavy', 'shield']
  const key = item.type === 'weapon' ? 'weapon' : item.type === 'consumable' ? 'consumable' : armorTypes.includes(subtype) ? 'armor' : 'wondrous'
  const type = GEAR_TYPES.find((t) => t.key === key)
  const bonus = sys.magicalBonus ?? sys.armor?.magicalBonus
  const spec = emptyFeatureSpec('gear')
  spec.item = { ...foundryItemToNpcItem({ ...item, type: 'feat' }), itemType: 'feat' }
  spec.gear = {
    ...emptyGear(key),
    subtype: type.subtypes.some(([k]) => k === subtype) ? subtype : type.subtypes[0][0],
    baseItem: sys.type?.baseItem ?? '',
    rarity: sys.rarity ?? '',
    attunement: sys.attunement === 'required',
    weight: sys.weight?.value ? String(sys.weight.value) : '',
    magicalBonus: bonus ? String(bonus) : '',
    properties: (sys.properties ?? []).filter((p) => WEAPON_PROPERTIES.some(([k]) => k === p)),
    armorValue: sys.armor?.value ? String(sys.armor.value) : '',
    dexCap: sys.armor?.dex != null ? String(sys.armor.dex) : '',
    strength: sys.strength ? String(sys.strength) : '',
    stealthDisadvantage: (sys.properties ?? []).includes('stealthDisadvantage'),
    autoDestroy: sys.uses?.autoDestroy !== false,
    blocks: [],
  }
  return spec
}

// An Item Maker record (item_maker_items: { id, name, item: { blocks } }) as a
// gear spec: a wondrous item with its written description and no mechanics.
// The Item Maker had no rarity, kind or stats, so those are left to fill in.
export function itemMakerRecordToSpec(record) {
  const spec = emptyFeatureSpec('gear')
  spec.item = { ...spec.item, name: record.name || record.item?.name || 'Untitled' }
  spec.gear = { ...emptyGear('wondrous'), rarity: '', blocks: structuredClone(record.item?.blocks ?? []), source: { itemMaker: record.id } }
  return spec
}
