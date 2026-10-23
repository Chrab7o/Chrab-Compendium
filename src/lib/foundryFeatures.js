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
  foundrySpellToNpcSpell,
  textToHtml,
} from './foundryActorBuilder.js'
import { behaviorSummary, deathStanceBehavior } from './foundryBehaviors.js'

export const FEATURE_KINDS = [
  { key: 'feat', label: 'Feature' },
  { key: 'spell', label: 'Spell' },
]

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
const NEUTRAL_OWNER = { ...emptyNpcSpec(), name: 'you' }

export function emptyFeatureSpec(kind = 'feat') {
  return {
    kind,
    featType: 'class',
    requirements: '', // "Fighter 3", shown under the name on the sheet
    item: { ...emptyNpcItem('action'), activities: [] },
    spell: { ...emptyNpcSpell(), method: 'slots' },
  }
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

export function buildFeatureItem(spec, { draftId = null } = {}) {
  let built
  if (spec.kind === 'spell') {
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
  if (item?.type !== 'feat') throw new Error('That file is not a Foundry feature or spell export.')
  const spec = emptyFeatureSpec('feat')
  spec.featType = item.system?.type?.value || 'class'
  spec.requirements = item.system?.requirements ?? ''
  spec.item = foundryItemToNpcItem(item)
  return spec
}

// ---------------------------------------------------------------------------
// Templates: ready-made features to start from.

export const FEATURE_TEMPLATES = [
  {
    key: 'deathStance',
    label: 'Death Stance',
    help: 'Bonus-action stance with a blood-red aura. Natural 19-20 on a melee attack roll heals 1d10 + CON; a melee hit can add 1d10 necrotic at the cost of the same damage to you.',
    build: () => {
      const spec = emptyFeatureSpec('feat')
      spec.item = {
        ...spec.item,
        name: 'Death Stance',
        section: 'bonus',
        img: 'icons/svg/skull.svg',
        behavior: deathStanceBehavior(),
      }
      return spec
    },
  },
]
