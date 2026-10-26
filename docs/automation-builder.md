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
- **Remembered numbers** outlast the roll. "Remember a number" saves one on the item, in
  `flags.chrab-sync.memory.<name>` = `{ value, at, forget }`. `at` is game time (`game.time.worldTime`, seconds).
  `forget` is how long it may go without a new "remember" before it lapses (0 = never). The value "A number you
  remembered" reads it back, or its starting value (math) when there's none or it has lapsed. "Forget it" deletes it.
  A combat round is 6 seconds of game time. Out of combat, game time only moves if the GM moves it.
- **"Make this attack a critical hit"** (after the attack roll only) sets `workflow.isCritical`. Midi reads that when
  it rolls damage, so the damage is rolled once, as a crit. "The roll it normally crits on" is the activity's
  `criticalThreshold` (20, or 19 with a feature like Improved Critical).
- **"Show a pop-up"** shows a notification to whoever rolled. With "the GM sees it too", it also whispers the GMs a
  message flagged `chrab-sync.popup`. Chrab Sync 0.2.1+ shows that as a pop-up on the GM's screen; without it, the GM
  just gets the whisper.

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
- The model, problem checks, summaries and code generator, tested in `npm test`.
- The dialog, and the export/import in `foundryActorBuilder.js`.
- The dialog opens from each roll's automation section ("Build automation…"). A roll with a flow shows its summary
  there, with Edit and Remove buttons. The flow replaces the recipe script picker while it's in use.
- 2026-10-25, for the Ravanous Necrolight (Rezire's sword: the crit number drops by 1 per hit on a living creature,
  resets on a crit or after a minute): remembered numbers, "The roll it normally crits on", "It's not a critical
  hit", "Make this attack a critical hit" and "Show a pop-up". The tests run each against the stand-in workflow.
  - Chrab Sync 0.2.1 adds the GM's pop-up.
  - The Item Forge also now imports a weapon intact: its base damage is the attack's first damage line, plus
    two-handed damage and mastery. Built weapons had been rolling that first line twice; the line now moves off the
    attack.

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
| Make it a crit | `workflow.isCritical = true` (midi's setter: a "direct" critical override) | postAttackRoll |
| The crit number | `workflow.activity.criticalThreshold` (dnd5e: the activity's, or the actor's `weaponCriticalThreshold`) | postAttackRoll |
| Remembered numbers | `item.update({ "flags.chrab-sync.memory.<name>": … })`, `game.time.worldTime` | any |
| Pop-ups | `ui.notifications.warn`; for the GM, a whisper with `flags.chrab-sync.popup` and Chrab Sync's `createChatMessage` hook | any |

Things to watch for in that first run:
- Does `workflow.chrabFlow` survive from `preItemRoll` all the way to `postActiveEffects`?
- After "Make this attack a critical hit", is there one damage roll, as a crit, with auto-roll damage on and off?
- Does a remembered number survive a reload, and lapse after 10 combat rounds?
- Does the GM's pop-up show when a player attacks (Chrab Sync 0.2.1)?
- Does `setDamageRolls` at `postDamageRoll` change the damage that's applied?
- Does the card post exactly once?
- What happens when a player who doesn't own the target applies an effect to it?
