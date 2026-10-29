// midi runs "[pass]ActivityMacro-<id>" only when <id> is the activity being
// used (Workflow.ts resolveActivityMacroCall). Copying an activity from one
// item to another by hand gives it a new id, while the item's
// midi-qol.onUseMacroName flag keeps naming the old one, and the script then
// silently never runs (Bhern's Launch, copied in from the class compendium).
//
// The site writes those hooks in activity order, so a stale id is given the
// next activity, in order, that has a script and isn't named by a hook yet.

import { MODULE_ID } from './constants.mjs'

const HOOK = /ActivityMacro-([A-Za-z0-9]+)/g

// Returns true if the item's flag was rewritten.
export async function relinkActivityMacros(item) {
  const flag = item?._source?.flags?.['midi-qol']?.onUseMacroName
  if (typeof flag !== 'string' || !flag.includes('ActivityMacro-')) return false
  const activities = Object.entries(item._source.system?.activities ?? {})
    .map(([id, a]) => ({ id, sort: a.sort ?? 0, scripted: !!a.macroData?.command?.trim() }))
    .sort((a, b) => a.sort - b.sort)
  const ids = new Set(activities.map((a) => a.id))
  const named = [...flag.matchAll(HOOK)].map((m) => m[1])
  const stale = [...new Set(named.filter((id) => !ids.has(id)))]
  if (!stale.length) return false

  const free = activities.filter((a) => a.scripted && !named.includes(a.id)).map((a) => a.id)
  const to = new Map(stale.map((id, i) => [id, free[i]]).filter(([, next]) => next))
  if (!to.size) {
    console.warn(`${MODULE_ID} | ${item.name}${item.parent ? ` on ${item.parent.name}` : ''}: midi hook names a missing activity`, stale)
    return false
  }
  const next = flag.replace(HOOK, (all, id) => (to.has(id) ? `ActivityMacro-${to.get(id)}` : all))
  await item.update({ 'flags.midi-qol.onUseMacroName': next })
  console.log(`${MODULE_ID} | relinked ${item.name}${item.parent ? ` on ${item.parent.name}` : ''}: ${flag} -> ${next}`)
  return true
}

// GM login: repairs the Chrab Sync items already in the world and on actors.
export async function relinkWorldActivityMacros() {
  const ours = (item) => !!item.flags?.[MODULE_ID]
  const items = [...game.items.filter(ours), ...game.actors.contents.flatMap((a) => a.items.filter(ours))]
  let fixed = 0
  for (const item of items) {
    try {
      if (await relinkActivityMacros(item)) fixed++
    } catch (err) {
      console.warn(`${MODULE_ID} | couldn't relink ${item.name}`, err)
    }
  }
  return fixed
}
