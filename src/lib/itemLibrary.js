// The item library: Item Forge drafts (feature_drafts) placed on NPCs.
//
// An NPC's spec.items holds two kinds of entry:
//   - an inline item: the whole item, as NPCs always stored them
//   - a link: { key, draftId, section, legendaryCost, itemType }, which points
//     at a library item and keeps only what belongs to this NPC - where it
//     sits on the statblock, what a legendary action costs, and whether it
//     shows on the sheet as a natural weapon
//
// resolveNpcSpec swaps each link for its library item before anything reads
// the items (preview, statblock, buildNpcActor), so to-hit, DCs and damage are
// still baked from the NPC's own stats. Editing the library item changes it on
// every NPC that links it, the next time each one is saved or sent.
// See docs/feature-forge-guided.md.

import { randomId } from './foundryActorBuilder.js'
import { emptyFeatureSpec } from './foundryFeatures.js'

export const isLinked = (entry) => !!entry?.draftId

export function itemLink(draftId, { key, section = 'action', legendaryCost = 1, itemType = 'feat' } = {}) {
  return { key: key || randomId(), draftId, section, legendaryCost, itemType }
}

export function linkedDraftIds(spec) {
  return [...new Set((spec?.items ?? []).filter(isLinked).map((e) => e.draftId))]
}

// The library item as it sits on this NPC. Its key is the link's, so the same
// library item can sit on an NPC twice, and "also spends" rows that point at
// it keep working when an inline item moves to the library.
export function linkedItem(link, featureSpec) {
  return {
    ...featureSpec.item,
    key: link.key,
    section: link.section || 'action',
    legendaryCost: link.legendaryCost ?? 1,
    itemType: link.itemType || 'feat',
    draftId: link.draftId,
  }
}

// drafts: Map of draft id -> feature spec (featureSpecFromRow). Links whose
// draft isn't loaded (or was deleted) are left out.
export function resolveNpcSpec(spec, drafts) {
  return {
    ...spec,
    items: (spec.items ?? []).flatMap((e) => (!isLinked(e) ? [e] : drafts.has(e.draftId) ? [linkedItem(e, drafts.get(e.draftId))] : [])),
  }
}

export function missingLinks(spec, drafts) {
  return (spec.items ?? []).filter((e) => isLinked(e) && !drafts.has(e.draftId))
}

// An NPC's inline item as a library draft's spec. Legendary and lair are
// where it sits on this NPC, not part of the item, so the library copy
// defaults its rolls to an action.
export function librarySpecFromNpcItem(item) {
  const { draftId: _drop, ...rest } = item
  return {
    ...emptyFeatureSpec('feat'),
    featType: 'monster',
    item: { ...rest, section: ['legendary', 'lair'].includes(item.section) ? 'action' : item.section, itemType: 'feat' },
  }
}

// The link that replaces an inline item once it's in the library.
export function linkFromNpcItem(item, draftId) {
  return itemLink(draftId, { key: item.key, section: item.section, legendaryCost: item.legendaryCost, itemType: item.itemType })
}

// "Make a private copy": the library item, inline on this NPC only.
export function inlineCopy(link, featureSpec) {
  const { draftId: _drop, ...item } = linkedItem(link, featureSpec)
  return item
}
