# Automation Builder

## What it is

A builder for a roll's midi-qol macro that reads like a short script. A recipe script (`ScriptEditor` in
`AutomationFields.jsx`) gives you one fixed mechanic. The builder instead lets you write one, line by line, top to
bottom: set a variable, keep a remembered number between uses, `if` / `otherwise` (nested as deep as you like), and the
steps that do things (damage, healing, conditions, chat lines, pop-ups, crits…).

Example, the Ravanous Necrolight:

```
After the attack roll:
  remembered CritAt, starting at 20, forgotten after 1 minute without a change
  set natural = the natural d20 of the attack
  set hp = the target's current HP
  if natural is at least CritAt:
    make it a critical hit
    pop up "Ravenous: roll critical damage!" for the player and the GM
    set CritAt = 20
  otherwise:
    if the attack hit and the target isn't undead or construct and hp is more than 0:
      set CritAt = CritAt - 1
```

**Files:**
- `src/lib/automationFlow.js`: the data model, conversion from version 1, problem checks, words and the code
  generator.
- `src/components/dm/feature/AutomationWizard.jsx`: the editor dialog. A folded line shows its words in code style;
  clicking it opens its boxes. "+ Add a line" at the end of every list (each part, each branch of an if) offers the
  line kinds that work there.
- `src/lib/automationFlow.test.mjs`: unit tests, plus simulated runs of the generated macro against a fake midi
  workflow (it's part of `npm test`). Includes the Necrolight above over several attacks.
- `src/lib/foundryActorBuilder.js`: exports a flow and reads it back.
- Opened from the **Midi-qol automation** section of every roll (`AutomationSection` in `npc/ActionBuilder.jsx`), so
  it works in the NPC builder and the Item Forge.

## The data

`activity.flow` (null when it isn't used), version 2:

```js
{ key, name /* chat card title, '' = item name */, color /* card color, '' = default */, version: 2, sections: [
  { key, trigger: 'use' | 'preAttack' | 'attack' | 'save' | 'damage' | 'done', lines: [
    /* a step (FLOW_STEPS: value, math, memory, forget, flavor, popup, makeCrit, damageRoll, …), or */
    { key, type: 'if', join: 'all' | 'any', checks: [ /* FLOW_CHECKS */ ], then: [ /* lines */ ], else: [ /* lines */ ] },
  ] },
] }
```

- **Sections** are the points in the roll (`FLOW_TRIGGERS`), mapped to midi passes: `preItemRoll`,
  `preAttackRollConfig`, `postAttackRoll`, `postSave`, `postDamageRoll`, `postActiveEffects`. Only the ones that fit
  the roll's kind are offered, and they're kept in the order midi runs them.
- **Checks** (`FLOW_CHECKS`), **steps** (`FLOW_STEPS`) and **values** (`FLOW_VALUES`) each say which trigger they need
  (`needs`) or are limited to (`only`). `flowProblems()` reports the ones used too early, unknown variable names,
  ifs with nothing to check or nothing inside, and empty parts. Each problem names the line (`key`). The dialog won't
  accept a flow that has problems; parts with no lines are left out when it's saved.
- **Variables** are set by "Set a variable to a value", "Set a variable to some math" and "A remembered number". A line
  sees every variable set on the lines written above it, in its part or an earlier one (`scriptScopes()`), the way
  code reads. They live on `workflow.chrabFlow[flow.key]`, so a value set at one pass can be used at a later one; one
  set in a branch that didn't run is 0.
- **Math** is a Foundry roll formula. Variable names get an `@` added (`hp / 2` → `@hp / 2`), so dice,
  `@abilities.con.mod` and `floor()` all work. Dice that are rolled show on the chat card.
- **Remembered numbers** outlast the roll. "A remembered number" declares one: its variable starts as the saved value,
  or its starting value (math) when there's none or it has lapsed. Every later "set" of that variable saves it on the
  item, in `flags.chrab-sync.memory.<name>` = `{ value, at, forget }`. `at` is game time (`game.time.worldTime`,
  seconds); `forget` is how long it may go without a change before it lapses (0 = never). "Forget a remembered number"
  deletes it and puts the variable back to its start. A combat round is 6 seconds of game time. Out of combat, game
  time only moves if the GM moves it.
- **"Make this attack a critical hit"** (after the attack roll only) sets `workflow.isCritical` and makes every target
  a hit (a crit always hits). Midi reads that when it rolls damage, so the damage is rolled once, as a crit. "The roll
  it normally crits on" is the activity's `criticalThreshold` (20, or 19 with a feature like Improved Critical).
- **"Show a pop-up"** shows a notification to whoever rolled. With "the GM sees it too", it also whispers the GMs a
  message flagged `chrab-sync.popup`. Chrab Sync 0.2.1+ shows that as a pop-up on the GM's screen; without it, the GM
  just gets the whisper.
- **"Pick targets on the map"** (When it's used, or After it's all done): a blue range ring around the user's token
  and the player clicks creatures. Its settings: how many (math, e.g. `3 + upcast`), range (blank = the roll's), any
  creature / enemies / allies (by token disposition), and whether picks stack on one creature. Left-click picks
  (again: one more if stacking, else unpick), shift-click puts all the rest on one, right-click takes one back, Enter
  finishes early, Esc cancels (at When it's used, that cancels the use).
  - At **When it's used** (midi's `preItemRoll`, after midi's own targeting) the picks become the roll's targets:
    `workflow.setTargets` and `canvas.tokens.setTargets` (midi's own `updateUserTargets`). The slot isn't chosen yet
    there (dnd5e's usage dialog comes after), so "upcast" isn't offered.
  - At **After it's all done** they don't change the roll; "every picked creature" lines act on them.
  - The picker is `PICK_RUNTIME` in `foundryAutomation.js`, shared with the Missiles recipe.
- **"Every picked creature"**: the target takes damage / regains HP / a condition / an effect can run once per picked
  creature (else once per target of the roll).
- **The ring's range** is the spell's or feature's own when the range box is blank, read when it's used: the
  activity's `range` (dnd5e copies the item's unless the activity overrides it, formulas already worked out).
  `chrabRange` in `PICK_RUNTIME` turns it into the scene's units with `CONFIG.DND5E.movementUnits` conversions (ft, mi,
  m, km). Touch is the reach (5 ft); self, any, special or none is no limit and no ring. A number in the box is feet.
  The Missiles recipe and template work the same way. Inside, `picks` is how many times that creature was picked, so missiles
  are `picks * (1d6 + 1)` (one roll) or `(picks)d6 + picks` (a die per missile), and "the target" means that creature.
- **"Slot levels above the spell's (upcast)"**: a value, dnd5e's `system.scaling` on the use card (or the scaled
  item's `flags.dnd5e.scaling`). Not at When it's used.
- **Version 1 flows** (`blocks` of when / if / then / otherwise, saved before 2026-10-25) are converted on read by
  `toScript()`, so they keep working and open in the new editor: a block's checks become an if around its steps, its
  otherwise steps the if's otherwise, and blocks at the same point share a part. Its remembered-number steps become a
  remembered number and sets of it.

## Export and read-back

- A flow with steps (`hasFlow`) **replaces** `activity.script`. `flowCode()` compiles it into one activity macro that
  switches on `args[0].macroPass`. That macro is listed in the item's `flags.midi-qol.onUseMacroName` once for each
  pass in `flowPasses()`.
- The chat card collects lines from every pass and posts once, at `postActiveEffects` (or earlier, if a line cancels
  the use).
- The flow spec is saved in `flags.chrab-sync.flows[activityId]`, and `foundryItemToNpcItem` restores it from there,
  so an exported item opens back up in the builder. When a flow is present, the macro text itself is ignored on import.

## Status (2026-10-25)

Done:
- The model, problem checks, summaries and code generator, tested in `npm test`.
- The dialog, and the export/import in `foundryActorBuilder.js`.
- 2026-10-25: the step-by-step questions (When → If → Then → Otherwise) were replaced by the script editor: lines top
  to bottom, nested ifs, remembered numbers as variables. Old flows convert on open. A roll's summary shows the script,
  indented.
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
| Picked targets become the roll's | `workflow.setTargets(new Set(tokens))`, `canvas.tokens.setTargets(ids)` | preItemRoll |
| Upcast levels | `workflow.chatCard.system.scaling` (dnd5e `_prepareUsageScaling`), else `item.flags.dnd5e.scaling` | after preItemRoll |
| Pop-ups | `ui.notifications.warn`; for the GM, a whisper with `flags.chrab-sync.popup` and Chrab Sync's `createChatMessage` hook | any |

Things to watch for in that first run:
- Does `workflow.chrabFlow` survive from `preItemRoll` all the way to `postActiveEffects`?
- After "Make this attack a critical hit", is there one damage roll, as a crit, with auto-roll damage on and off?
- Does a remembered number survive a reload, and lapse after 10 combat rounds?
- Does the GM's pop-up show when a player attacks (Chrab Sync 0.2.1)?
- Does `setDamageRolls` at `postDamageRoll` change the damage that's applied?
- Does the card post exactly once?
- What happens when a player who doesn't own the target applies an effect to it?
- Picking when it's used: do the attack / save / damage go to the picked creatures, and does the use card list them?
- Does Esc while picking stay out of Foundry's own Esc menu? Does a GM's click select the token too (harmless)?
- Is `system.scaling` on the use card by the time "After it's all done" runs, for an upcast spell?
