# Automation Builder

## What it is

A step-by-step builder for a roll's midi-qol macro. A recipe script (`ScriptEditor` in `AutomationFields.jsx`) gives you
one fixed mechanic. The builder instead lets you put one together from questions: **When** does it happen, **If**
what is true, **Then** what happens, **Otherwise** what happens instead. Repeat that for as many parts as the feature
needs.

Example: "When damage is rolled, grab the target's current HP as `hp`, do the math `hp / 2`, use that as the damage,
and add the flavor text 'The blade drinks half of {target}'s life.'"

**Files:**
- `src/lib/automationFlow.js`: the data model, problem checks, summaries and the code generator.
- `src/components/dm/feature/AutomationWizard.jsx`: the dialog (When → If → Then → Otherwise → Anything else? →
  Review).
- `src/lib/automationFlow.test.mjs`: unit tests, plus simulated runs of the generated macro against a fake midi
  workflow (it's part of `npm test`).
- `src/lib/foundryActorBuilder.js`: exports a flow and reads it back.
- Opened from the **Midi-qol automation** section of every roll (`AutomationSection` in `npc/ActionBuilder.jsx`), so
  it works in the NPC builder and the Feature Forge.

## The data

`activity.flow` (null when it isn't used):

```js
{ key, name /* chat card title, '' = item name */, color /* card color, '' = default */, blocks: [
  { key, trigger: 'use' | 'preAttack' | 'attack' | 'save' | 'damage' | 'done',
    checks: [ /* all must hold; [] = always */ ],
    steps: [ /* run in order */ ],
    otherwise: [ /* run when a check fails */ ] },
] }
```

- **Triggers** (`FLOW_TRIGGERS`) map to midi passes: `preItemRoll`, `preAttackRollConfig`, `postAttackRoll`,
  `postSave`, `postDamageRoll`, `postActiveEffects`. Only the triggers that fit the roll's kind are offered.
- **Checks** (`FLOW_CHECKS`), **steps** (`FLOW_STEPS`) and **values** (`FLOW_VALUES`) each say which trigger they need
  (`needs`) or are limited to (`only`). `flowProblems()` reports the ones used too early, along with unknown variable
  names and empty blocks. The dialog won't accept a flow that has problems.
- **Variables** are made by "Grab a value" and "Do some math" steps. They live on `workflow.chrabFlow[flow.key]`, so a
  value grabbed at one pass can be used at a later one. `varsBefore()` decides which variables a step can see: the
  ones from earlier blocks and from earlier steps in the same block.
- **Math** is a Foundry roll formula. Variable names get an `@` added (`hp / 2` → `@hp / 2`), so dice,
  `@abilities.con.mod` and `floor()` all work. Dice that are rolled show on the chat card.
- Blocks are always kept in the order midi runs them (`sortBlocks`).

## Export and read-back

- A flow with steps (`hasFlow`) **replaces** `activity.script`. `flowCode()` compiles it into one activity macro that
  switches on `args[0].macroPass`. That macro is listed in the item's `flags.midi-qol.onUseMacroName` once for each
  pass in `flowPasses()`.
- The chat card collects lines from every pass and posts once, at `postActiveEffects` (or earlier, if a block cancels
  the use).
- The flow spec is saved in `flags.chrab-sync.flows[activityId]`, and `foundryItemToNpcItem` restores it from there,
  so an exported item opens back up in the builder. When a flow is present, the macro text itself is ignored on import.

## Status (2026-10-25)

Done:
- The model, problem checks, summaries and code generator. The 12 tests pass.
- The dialog, and the export/import in `foundryActorBuilder.js`.
- The dialog opens from each roll's automation section ("Build automation…"). A roll with a flow shows its summary
  there, with Edit and Remove buttons. The flow replaces the recipe script picker while it's in use.

Not done yet:
- **No run in Foundry yet.** Every midi call below was taken from the midi-qol v14 source (the sandbox's
  `probes/midi-qol-v14-reference.md` and `vendor/midi-qol`) and tested only against a fake workflow. Each one needs a
  real run in Foundry 14.368 / dnd5e 5.3.3 / midi-qol 14. Build a test macro in the sandbox repo
  (`foundry-expirmenets`) first.
- Templates (`automationTemplates.js`) don't create flows yet. They could, now that flows exist.

## Midi calls to check in Foundry

| Used for | Call | Pass |
|---|---|---|
| Shared state across passes | `workflow.chrabFlow` (a property added to the workflow) | all |
| Replace or add damage | `workflow.damageRolls`, `await workflow.setDamageRolls([roll])` | postDamageRoll |
| Advantage / disadvantage | `workflow.attackRollModifierTracker.advantage/disadvantage.add(...)` | preAttackRollConfig |
| Cancel the use | the macro returns `false` | preItemRoll |
| Hit / crit / natural d20 | `workflow.hitTargets`, `workflow.isCritical`, `workflow.diceRoll`, `workflow.attackTotal` | postAttackRoll |
| Saves | `workflow.failedSaves`, `workflow.saveDC`, `workflow.tokenSaves[uuid].total` | postSave |
| Damage dealt | `workflow.damageList[].hpDamage + tempDamage` | postActiveEffects |
| Target checks | `MidiQOL.createConditionData(...)` + `MidiQOL.evalCondition(expr, data, { async: true })` | any |
| Damage / healing to a creature | `MidiQOL.applyTokenDamage([{ value, type }], n, new Set([token]), item, new Set(), {...})` | any |
| Effects on a creature you don't own | `MidiQOL.socket().executeAsGM("createEffects", { actorUuid, effects })` | any |
| Once per turn | the item flag `flags.chrab-sync.turns.<key>` = `combatId:round:turn` | any |
| Player prompts | `chrabDialog` (from `foundryChat.js` `CHAT_RUNTIME`) | any |

Things to watch for in that first run:
- Does `workflow.chrabFlow` survive from `preItemRoll` all the way to `postActiveEffects`?
- Does `setDamageRolls` at `postDamageRoll` change the damage that's applied?
- Does the card post exactly once?
- What happens when a player who doesn't own the target applies an effect to it?
