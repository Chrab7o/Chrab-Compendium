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

// A stored spec (feature_drafts.spec) over today's defaults, so drafts saved
// before a field existed still build.
export function featureSpecFromRow(stored) {
  const base = emptyFeatureSpec(stored?.kind)
  return { ...base, ...stored, item: { ...base.item, ...stored?.item }, spell: { ...base.spell, ...stored?.spell } }
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
