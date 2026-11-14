// Run with: npm test (from the Compendium root)
//
// Chrab Sync's behavior runtime (scripts/runtime.mjs, Phase 4): the generated
// runtime file matches the site's source, an item built with the module
// runtime carries a stub plus its data, and the module runs that data through
// the same code a generated macro would.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runtimeFile, runtimePath } from '../tools/build-runtime.mjs'
import { BEHAVIOR_RUNTIME, behaviorMacro, behaviorRuntimeData, deathStanceBehavior } from '../../../src/lib/foundryBehaviors.js'
import { buildFeatureItem, emptyFeatureSpec } from '../../../src/lib/foundryFeatures.js'

test('the generated runtime file is up to date (npm run module-runtime)', () => {
  assert.equal(readFileSync(runtimePath, 'utf8').replace(/\r\n/g, '\n'), runtimeFile())
})

const deathStance = () => {
  const spec = emptyFeatureSpec('feat')
  return { ...spec, item: { ...spec.item, name: 'Death Stance', section: 'bonus', behavior: deathStanceBehavior() } }
}
const hookOf = (built) => Object.values(built.system.activities)[0]

test('built with the module runtime: a stub macro, the data in flags; otherwise unchanged', () => {
  const spec = deathStance() // one spec: its rule keys are random
  const macro = buildFeatureItem(spec)
  const module = buildFeatureItem(spec, { moduleRuntime: true })
  assert.match(hookOf(macro).macroData.command, /const SETUP = /)
  assert.doesNotMatch(hookOf(module).macroData.command, /const SETUP = /)
  assert.match(hookOf(module).macroData.command, /api\?\.runBehavior/)
  const runtime = module.flags['chrab-sync'].runtime
  assert.equal(runtime.version, 1)
  assert.deepEqual(runtime.behavior, JSON.parse(JSON.stringify(behaviorRuntimeData(spec.item, spec.item.behavior))))
  // Everything else is the same item.
  const strip = (b) => {
    const c = structuredClone(b)
    delete hookOf(c).macroData
    delete c.flags['chrab-sync'].runtime
    return c
  }
  assert.deepEqual(strip(module), strip(macro))
  assert.equal(macro.flags['chrab-sync'].runtime, undefined)
})

test('the module runs the same code a generated macro holds', () => {
  const item = deathStance().item
  const { setup, whens } = behaviorRuntimeData(item, item.behavior)
  const macro = behaviorMacro(item, item.behavior)
  // A macro = header + SETUP + WHEN + the runtime; the module compiles WHEN + the runtime with SETUP passed in.
  assert.ok(macro.endsWith(`const SETUP = ${JSON.stringify(setup, null, 2)};\nconst WHEN = {\n${whens}\n};\n${BEHAVIOR_RUNTIME}`))
})

test('runBehavior compiles and calls the runtime with the item’s data', async () => {
  // Just enough of Foundry for runtime.mjs and the runtime's first lines.
  globalThis.foundry = { utils: { deepClone: (v) => structuredClone(v), escapeHTML: (s) => s } }
  globalThis.ui = { notifications: { warn: () => {} } }
  const warned = []
  globalThis.console = { ...console, warn: (...a) => warned.push(a.join(' ')) }
  const { runBehavior } = await import('../scripts/runtime.mjs')
  const built = buildFeatureItem(deathStance(), { moduleRuntime: true })
  const macroItem = { name: 'Death Stance', uuid: 'Item.x', flags: built.flags }
  // No actor: the runtime's own first check returns before touching Foundry.
  assert.equal(await runBehavior({ macroItem, actor: null, args: [{ macroPass: 'postActiveEffects' }] }), undefined)
  // An item without runtime data does nothing.
  assert.equal(await runBehavior({ macroItem: { name: 'x', flags: {} }, actor: null }), undefined)
  // Data from a newer runtime is refused, with a warning.
  const newer = { ...macroItem, flags: { 'chrab-sync': { runtime: { ...built.flags['chrab-sync'].runtime, version: 99 } } } }
  assert.equal(await runBehavior({ macroItem: newer, actor: null }), undefined)
  assert.ok(warned.some((w) => /newer Chrab Sync/.test(w)))
})
