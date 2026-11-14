// Chrab Sync runs feature behaviors itself (Phase 4 of the forge overhaul, in
// the lab's docs/forge-overhaul.md). An item built with the module runtime
// carries its data in flags.chrab-sync.runtime and a one-line macro that calls
// runBehavior; the code is runtime/behaviorRuntime.mjs, generated from the
// site's behavior runtime, so it's exactly what a generated macro would run.
// A fix to it ships with a module update, no re-sync needed.
//
// The runtime is compiled once per distinct set of rule conditions (WHEN),
// which sit in front of it as code, as in a generated macro.

import { MODULE_ID } from './constants.mjs'
import { BEHAVIOR_RUNTIME, BEHAVIOR_RUNTIME_VERSION } from './runtime/behaviorRuntime.mjs'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
// What midi's macro scope gives a generated macro, and its two constants.
const SCOPE = ['workflow', 'args', 'actor', 'token', 'rolledItem', 'rolledActivity', 'macroItem', 'macroActivity', 'SETUP']

const compiled = new Map() // whens code -> function
function compile(whens) {
  let fn = compiled.get(whens)
  if (!fn) {
    fn = new AsyncFunction(...SCOPE, `const WHEN = {\n${whens}\n};\n${BEHAVIOR_RUNTIME}`)
    compiled.set(whens, fn)
  }
  return fn
}

const warned = new Set()
function warnOnce(key, text) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`${MODULE_ID} | ${text}`)
  ui.notifications?.warn(`Chrab Sync: ${text}`)
}

// scope: what the item's stub macro passes (midi's macro scope).
export async function runBehavior(scope) {
  const item = scope?.macroItem
  const data = item?.flags?.[MODULE_ID]?.runtime
  if (!data?.behavior?.setup) return
  if ((Number(data.version) || 0) > BEHAVIOR_RUNTIME_VERSION) {
    return warnOnce(`version:${data.version}`, `${item.name} needs a newer Chrab Sync (its automation is version ${data.version}, this module knows ${BEHAVIOR_RUNTIME_VERSION}). Update the module.`)
  }
  let fn
  try {
    fn = compile(String(data.behavior.whens ?? ''))
  } catch (err) {
    return warnOnce(`compile:${item.uuid}`, `${item.name}'s automation has an error in a rule's condition: ${err.message}`)
  }
  // A copy: the runtime may annotate SETUP while it runs.
  const setup = foundry.utils.deepClone(data.behavior.setup)
  return fn(scope.workflow, scope.args, scope.actor, scope.token, scope.rolledItem, scope.rolledActivity, item, scope.macroActivity ?? null, setup)
}
