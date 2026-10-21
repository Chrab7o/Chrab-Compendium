import { buildNpcActor } from '../../../lib/foundryActorBuilder'

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Same file name Foundry's own "Export Data" uses, so downloads sort next to
// real exports. In Foundry: create a blank NPC actor, right-click it in the
// sidebar -> Import Data -> pick this file.
export function downloadNpcActor(spec, draftId = null) {
  const actor = buildNpcActor(spec, { draftId })
  const blob = new Blob([JSON.stringify(actor, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fvtt-Actor-${slugify(spec.name || 'npc') || 'npc'}.json`
  a.click()
  URL.revokeObjectURL(url)
}
