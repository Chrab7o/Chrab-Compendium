# Feature Forge and behaviors

## What this is

Two pieces, built together:

1. **Behaviors**: a framework for automation that reacts to *everything a character does*, not just the item it's on.
   For example: "while this stance is on, when I make a melee attack roll and roll a natural 19-20, I regain 1d10 +
   CON". Behaviors work on NPC items (NPC Forge) and on standalone features.
2. **Feature Forge** (`/dm/feature-forge`): build a single class feature, feat or spell on the site and send it to
   Foundry on its own. Chrab Sync's new **Items** tab puts it in the world's Items directory, ready to drag onto a
   character. A re-send can also update the copies characters already have.

**Templates:** new features can start from an automation template, a type of mechanic with its own settings (e.g.
Defenses). See `docs/automation-templates.md`, which also has the Dark Knight roadmap.

**Class features:** a Feature Forge item can also be linked to a homebrew class or subclass feature. The **Plutonium
feed** then hands it to characters when they level into it. See `docs/homebrew-feed.md`.

The first feature is **Death Stance**, available as a template. It's the Dark Knight's Harbinger of Darkness feature
(level 3, upgraded at 7). The template copies the class's own wording from `homebrew_subclass_features` as the item
description.
- **Entering it:** a bonus action enters the stance for 1 minute. Uses equal the proficiency bonus per long rest, and
  leaving early doesn't refund one.
- **While it's on:** advantage on attack rolls, and a blood-red visual on the token.
- **Healing:**
  - Levels 3-6: a melee critical hit heals 1d10 + CON.
  - Level 7+: a melee attack roll with a natural 19 or 20 heals 2d10 + CON. It doesn't need to hit.
- **Necrotic Strike:** a melee hit asks "Use Death Stance: Necrotic Strike?". Yes adds 1d10 necrotic (the dice double
  on a crit), and the attacker takes exactly the same amount. Their own resistances don't reduce it.
- **Refuse to Fall:** the first time per stance that damage would drop them to 0, they spend a hit die and stay up with
  die + CON hit points. The stance stays on. This also covers the strike's own cost.

Target environment: Foundry 14.368, dnd5e 5.3.3, midi-qol 14.0.x.

## How behaviors work

An item's `behavior` is `{ key, mode, toggle, rules[] }`. `lib/foundryBehaviors.js` compiles it into midi-qol
pieces that are self-contained in the item. It uses no Macro documents and no DAE, and doesn't need Chrab Sync at play
time.

| Piece | What it is |
| --- | --- |
| **Hook activity** | A utility activity placed **first** on the item, id = `behavior.key`. Its `macroData` is the whole generated script. A toggle's hook is the "Toggle" button on the sheet. A passive one's hook is `automationOnly` (hidden). |
| **Hook changes** | One `flags.midi-qol.onUseMacroName = "ActivityMacro, <pass>"` change per workflow pass the rules need. Midi resolves the bare `ActivityMacro` to the first activity of the effect's item. Every workflow the owner starts then runs the hook. |
| **Stance effect** (toggle) | A non-transfer item effect flagged `chrab-sync.stance`, with `showIcon: 2` so its icon always shows on the token. Using the item copies it onto the owner (`origin` = the item), and using it again removes it. Your own effects set to *While toggled on* are used as the stance, for things like AC bonuses or advantage. If you don't add one, a plain one is generated. With a duration ("Lasts N minutes"), every stance effect gets `duration: { units: "seconds", value: N Ã— 60 }`. The macro clears the copied start so it counts from the moment the stance turns on. |
| **Carrier effect** (passive) | A transfer effect holding the hook changes. It's always on. |
| **`flags.chrab-sync.behavior`** | The behavior spec, so an export reads back into the editor. |

**Rules:** each rule has an event, filters and an outcome. Rules never fire for the feature's own use.

| Event | midi pass | Notes |
| --- | --- | --- |
| I make an attack roll | `postAttackRoll` | Hit or miss. `natural` is the kept d20. |
| I hit with an attack | `postAttackRoll` | At least one target hit. |
| I roll damage | `damageBonus` | On an attack, only when something was hit. The only event that can add damage. |
| My damage has landed | `postActiveEffects` | `dealt` = HP damage dealt. |
| I would drop to 0 hit points | `preTargetDamageApplication` | A **target** pass: someone else's damage is about to land on the owner. It runs on the attacker's client (the GM for monsters), before the damage is applied. The only event for "I stay up instead". The owner's own costs ("I take the same damage", "I take damage") check it too. |

- **Filters:**
  - melee or ranged
  - weapon (unarmed counts) or spell
  - natural d20 at least N
  - critical hits only
  - **level tiers:** from level N and/or up to level N. They count the class named in "Level tiers count levels in
    class" (its dnd5e identifier). Without it, or if the owner doesn't have that class, they count character level.
    NPCs have no level, so they ignore tiers.
  - once per turn (only counted while combat is running)
  - **once per stance** (toggles): marked on the stance effect, so turning the stance on again resets it
  - target conditions, using the same guided presets as the per-roll automation
  - a raw JavaScript condition over `c.natural`, `c.hits`, `c.dealt`, `c.target`, `c.actor`, `c.item`, `c.activity`,
    `c.level`, `c.incoming` (the damage about to land, for "would drop to 0") and `c.workflow`
- **Outcomes:**
  - regain HP
  - gain temporary HP
  - take damage
  - extra damage to the target (optionally "I take the same damage", and dice can double on a crit)
  - **stay up instead** (only with "would drop to 0"): the formula is the HP the owner is left with.
    - "Spend one of my hit dice" uses the biggest unspent class hit die. With none left, the rule doesn't apply and
      the owner goes down.
    - `@hitDie` in the formula is that die (`1d10`).
    - The macro rewrites midi's `damageItem.damageDetail` (what midi actually applies) so the hit lands the owner on
      exactly that number. Temporary HP is used up first.
- **Ask first:** shows a yes/no prompt on the rolling player's screen. "Would drop to 0" never asks, because it runs on
  the attacker's screen.
- **Formulas** are dnd5e roll formulas against the **owner's** roll data, plus `@natural`, `@hits` and `@dealt`, and
  `@hitDie` for staying up.
- **Visuals:** a Sequencer effect attached under the token and tied to the stance effect, so it ends when the effect
  is deleted however that happens. The macro tries the "Sequencer file" set on the site first, then a list of guessed
  JB2A names. With no Sequencer, or no match, the token gets a pulsing light in the visual's colour instead, which is
  restored when the stance ends.

**Where it runs:** midi runs the macro on the client of whoever uses the item. For a PC that's the player, who owns
their actor and token, so healing, self-damage and the light all work without the GM.

## Building your own

On a feature (or an NPC item), open **Behavior: stances and reactions**:
1. **Mode:** *Toggle on / off* for a stance, *Always on* for a passive trait.
2. **Toggle settings:** the action it takes, how many minutes it lasts (blank = until turned off), the button name,
   the visual, and optionally a Sequencer file. To find a file, open Sequencer's Database Viewer in Foundry and copy an
   entry such as `jb2a.â€¦`. Limited uses go on the item itself (Uses, e.g. `@prof` per long rest).
3. **+ Rule** for each reaction. Pick *When* and *Then*, narrow it with the filters, and write the amount as a formula.
   The rule's sentence under it shows what it will do. **+ Rule: refuse to fall** starts a "would drop to 0 â†’ stay up"
   rule that spends a hit die.
   - **Level upgrades:** give the old version an "Up to level" and the new one a "From level". Set "Level tiers count
     levels in class" to the class's identifier.
4. To change stats while the stance is on, add an effect, set **Applies to** to *This creature, while toggled on*, and
   give it changes (AC bonus, resistance and so on).
5. The preview pane shows the item and the generated macro. **Send to Foundry**, then open **Chrab Sync â†’ Items â†’
   Apply** in the world.

Anything a rule can't express can still use the per-roll **Script** editor (midi-qol automation on a roll). For
something new, the next step is extending the framework (below) rather than hand-editing generated code. Re-sending
replaces the generated macro.

**Extending the framework:** add an event to `BEHAVIOR_EVENTS` (with its midi pass) or an outcome to
`BEHAVIOR_OUTCOMES`, handle it in the rule loop inside `behaviorMacro`, and give `ruleSummary` its wording. Then add
a case to `foundryBehaviors.test.mjs`, which runs the generated macro against mocked Foundry globals.

## What changed

| File | What |
| --- | --- |
| `src/lib/foundryBehaviors.js` | The framework: modes, events, outcomes, visuals, rules text, the macro generator, and `deathStanceBehavior()`. |
| `src/lib/foundryBehaviors.test.mjs` | Shapes, round trips, and the generated macro run against mocked Foundry, dnd5e and midi-qol (toggle, 19-20 heal, necrotic strike with cost, crits, prompts, once per turn, target conditions). |
| `src/lib/foundryActorBuilder.js` | `buildNpcItem` adds the hook activity, the stance and carrier effects, and the flags. `foundryItemToNpcItem` (now exported) reads them back. Effects gained `stance`, and items gained `behavior`. |
| `src/lib/foundryFeatures.js` | Feature specs (`feat` or `spell`), `buildFeatureItem`, `featureItemToSpec`, and `FEATURE_TEMPLATES` (Death Stance). |
| `src/components/dm/npc/BehaviorFields.jsx` | The behavior editor, in every item card. |
| `src/components/dm/npc/ActionBuilder.jsx` | Item cards show the behavior editor. The effect *Applies to* gained *While toggled on*. `ItemCard` is exported with a `standalone` mode. |
| `src/components/dm/npc/SpellcastingPanel.jsx` | `SpellCard` is exported with a `standalone` mode (no NPC casting method). |
| `src/components/dm/npc/StatblockPreview.jsx` | NPC statblocks print behavior text. |
| `src/components/dm/feature/FeatureEditor.jsx`, `downloadItem.js` | The `/dm/feature-forge/new` and `/:id/edit` editors, with a preview and the generated macro. |
| `src/pages/dm/DMFeatureForgePage.jsx` | List page: templates, drafts, send, download, duplicate, delete, and import of a Foundry item export. |
| `src/App.jsx`, `DMLayout.jsx`, `DMHome.jsx` | Routes, nav link and dashboard card. |
| `supabase/migrations/20261101000000_feature_drafts.sql` | `feature_drafts`, DM-only, with the same queue columns and trigger as `npc_drafts`. Adds `sync_pull_features` and `sync_report_feature`, gated by `is_sync() or is_dm()`. |
| `foundry/chrab-sync/scripts/items.mjs` | Applies a queued item. **Update:** backs up to "Chrab Sync Item Backups", then `importFromJSON`. **New:** creates it in the "Chrab Corner Features" folder. Optionally refreshes copies on actors, keeping their id and spent uses. |
| `foundry/chrab-sync/scripts/apps.mjs`, `queue.mjs`, `main.mjs`, `constants.mjs`, `styles/chrab-sync.css` | The window has NPCs, Items and Characters tabs. The queue pulls features too, and tolerates a database without them. There's a Chrab Sync button in the Items sidebar and a *Feature folder* setting. |

**Sandbox** (`foundry-expirmenets`):
- `scripts/build-feature-probe.mjs` builds `samples/fvtt-Item-death-stance.json` and a passive variant.
- The checklist is `probes/death-stance.md`.
- The actor-hook research is now in `probes/midi-qol-v14-reference.md`.

## Security

Behaviors and scripts are JavaScript that runs in the browser of whoever uses the item. On a PC, that's a player.
- Only DMs can write `feature_drafts` (RLS).
- The sync role can only read the queue and report results, the same as for NPCs.
- Chrab Sync imports items as they are, and its Items tab says that features carry scripts. Review the generated macro
  in the preview pane before sending something new.

## Setup after merge

1. `npx supabase db push`. This adds `feature_drafts` and the two RPCs. It's additive, and the NPC queue keeps working
   before it's applied.
2. Let the deploy finish, then use **Check for updates** in Foundry so the world gets the Items tab.
3. The Feature Forge appears under the DM nav.

## Verify

```powershell
npm test        # expect: pass 121, fail 0 (includes the feed's and templates' tests)
npm run build
```

**Foundry (before any of the above):** import the sandbox's `samples/fvtt-Item-death-stance.json` directly and work
through `probes/death-stance.md`. That checks the automation itself without the site or the queue.

**Site:**
- [ ] **Feature Forge â†’ Death Stance â†’ Use** opens a filled-in editor:
  - The description is the class text.
  - Uses are `@prof` per long rest.
  - There's one *While toggled on* effect with advantage on attacks.
  - "Lasts" is 1 minute.
  - There are four rules, the two heals showing "Before level 7" and "From level 7".
  - The generated macro is visible.
- [ ] Change the level 7 heal's natural minimum to 18: the rule sentence and the rules text update.
- [ ] **+ Rule: refuse to fall** adds a rule whose When is locked to "I would drop to 0 hit points". Switching its Then
      to "I regain hit points" moves When back to an attack event.
- [ ] Add an effect, choose *While toggled on*, and add an AC bonus. The preview lists it as "while toggled on".
- [ ] **Save & download Foundry JSON**, then **Load Foundry item** with that file: everything comes back, including
      the behavior and the stance effect.
- [ ] **+ New spell**: no casting-method picker, and the save DC defaults to Spellcasting.
- [ ] NPC Forge: an item's behavior section works the same, and the statblock preview prints its rules text.

**Chrab Sync:**
- [ ] Send Death Stance. In Foundry, the Items sidebar shows **Chrab Sync (1)** and it opens on the **Items** tab.
- [ ] Apply: the item appears in "Chrab Corner Features", and the site shows **In Foundry**.
- [ ] Drag it onto a test PC, change the rule on the site, re-send, and Apply with "Also update copies" ticked. The
      PC's copy updates in place and keeps its spent uses, and a dated backup appears in "Chrab Sync Item Backups".
- [ ] The NPC and Characters tabs behave as before.

## Known limitations

- **Light fallback:** if the stance effect is deleted by hand from the sheet or runs out, the light stays on until the
  item is toggled again. Turning it on clears the old light first. The Sequencer visual doesn't have this problem,
  because it's tied to the effect.
- **"Would drop to 0" only sees midi damage:** it catches midi workflows (attacks, saves, damage cards) and this
  feature's own costs.
  - It doesn't catch damage applied some other way: a hand-edited HP value, another module's `applyDamage`, or
    over-time damage that midi applies outside a workflow.
  - It needs the client running the attack to be able to update the owner. That's the GM for monsters; a player hitting
    another player's character can't, and the macro logs that and lets them fall.
- **Hit dice are class hit dice:** NPCs have no class items, so "Spend one of my hit dice" never applies to them.
- **Visual guesses:** the built-in JB2A names are guesses until the probe confirms one. The light fallback covers a
  miss, and the Sequencer file field fixes it for good.
- **Unlinked copies aren't updated:** copies on unlinked token actors are skipped by "update copies". PCs are linked,
  so this rarely matters.
- **Over-time strings:** the over-time **string** row on effects still bakes the numbers from an NPC. Use the
  per-roll "Repeats each turn" option on standalone features instead.
- **Partly tested in Foundry:**
  - The toggle, visual, heal and Necrotic Strike work in the world (2026-10-23).
  - Not run yet: the duration, level tiers, once per stance and "would drop to 0". The sandbox's `probes/death-stance.md`
    (part 2) has the checks and the unverified calls.
