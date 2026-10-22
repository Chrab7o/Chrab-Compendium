# NPC Forge — branch `npc-forge` (Phase 1)

## What this is

The first piece of a Foundry VTT actor editor built into Chrab-Corner, so NPCs can be made (and later PCs edited)
without having the Foundry page open. Target environment: Foundry **14.368**, dnd5e **5.3.3**, world
`eclipse-of-the-burning-sun`.

Phase 1 scope: build NPC statblocks on the site, save them as drafts, and **download them as Foundry actor JSON**
(imported in Foundry with right-click → Import Data). No Foundry module yet.

Planned later phases (not on this branch):
- **Phase 2:** "Chrab Sync" Foundry module. A dedicated, limited Supabase `sync` user, whose session is remembered in
  the GM's browser only (never in module files or world settings). It pulls drafts for the world's mapped campaign
  and creates the actors.
- **Phase 3:** PC change queue (add/remove items, level up), applied by the module as patches with backups. Sync back
  into `characters.raw_data`.
- **Phase 4:** compendium item refs, Chris's Premades automation, CR scaling.

Ground rules:
- **NPCs are always GM-only.** `ownership: { default: 0 }` on the actor and every item. Tokens are unlinked, and
  names and bars show only to owners.
- **The builder writes only meaningful source fields.** Foundry's DataModels fill defaults on import, including
  midi-qol's activity blocks, so the builder never copies module flag shapes.
- **The mana-system module is not used** and is ignored.

## What changed

| File | What |
| --- | --- |
| `src/lib/foundryActorBuilder.js` | Pure JS (no React). `buildNpcActor(spec)` → dnd5e actor. `npcActorToSpec(actor)` → spec, for making variants of existing monsters. Also holds the statblock math (`activitySummary`, `attackToHit`, `saveDc`, `averageFormula`) and the empty shapes (`emptyNpcSpec`, `emptyNpcItem`, `emptyActivity`, `emptyEffect`). |
| `src/lib/foundryActorBuilder.test.mjs` + `src/lib/__fixtures__/kraken.actor.json` | `node --test` suite. The fixture is a real Plutonium-imported MM'25 Kraken export from the world. |
| `src/pages/dm/DMNpcForgePage.jsx` | `/dm/npc-forge` list page: new, edit, download, duplicate, delete, and "Import Foundry NPC" (export → new draft). |
| `src/components/dm/npc/NpcEditor.jsx` | `/dm/npc-forge/new` and `/:id/edit`. The form state *is* the stored spec. |
| `src/components/dm/npc/ActionBuilder.jsx` | Statblock items grouped by section (Traits, Actions, Bonus Actions, Reactions, Legendary, Lair). Each item has rolls (attack / save / damage / heal / utility) and effects (conditions, DAE special durations). |
| `src/components/dm/npc/StatblockPreview.jsx` | Live 2024-style statblock using the builder's math. |
| `src/components/dm/npc/downloadActor.js` | Blob download as `fvtt-Actor-<slug>.json`. |
| `supabase/migrations/20261029000000_npc_drafts.sql` | `npc_drafts` (id, name, cr, campaign_id, spec jsonb, timestamps). DM-only RLS via `is_dm()`. |
| `src/App.jsx`, `src/components/dm/DMLayout.jsx`, `src/pages/dm/DMHome.jsx` | Routes, DM nav link, dashboard card. |
| `src/index.css` | `npc-*` styles appended at the end. |
| `package.json` | `"test"` script. |

## Status

- Merged to `main` on 2026-10-21 (branch `npc-forge`, since deleted). Phase 2 is documented in
  `docs/npc-forge-phase2.md`.
- `npm test` covers the builder against the real Kraken export.
- Since Phase 2, the draft flag is `flags['chrab-sync'].npcDraftId`. Phase 1 downloads used `chrab-corner`, and the
  sync module still recognizes those.
- **Custom activities** (branch `npc-forge-activities`) add these to the builder:
  - An "@" reference picker on formula fields, with live resolved values.
  - Per-roll labels and activation.
  - "Also spends" rows: another feature's uses as a shared pool, legendary actions, HP, or any attribute.
  - Per-effect "applied by" rolls.
  - Guided effect changes written as v14 `system.changes`: `{ key, value, type, phase }`, no numeric mode.
  - Curated midi-qol options: triggered activities, magical damage, `affects` enemy/ally auto-targeting, and
    OverTime. OverTime bakes its DC and damage into numbers, because midi evaluates it on the target.

  `EFFECT_CHANGES` and `SPEND_SOURCES` live in `foundryActorBuilder.js`. Foundry checks run from the sandbox repo:
  `probes/custom-activities.md` and `scripts/build-probe.mjs`.
- **Attribute catalog** (`src/lib/foundryAttributes.js`): 179 NPC attribute paths. Each one is tagged for where it can
  be used:
  - `f`: formula reference (roll data, including derived totals).
  - `e`: effect change target (stored and bonus fields only, because effects apply before dnd5e derives totals).
  - `s`: something an activity can spend.

  One searchable menu serves the formula "@" button, the effect "Other attribute" path and the "Also spends" attribute
  path. `npcRollData` computes the values the editor can know; spellcasting and slots show "—". To verify the paths
  against a live `getRollData()` dump, run `scripts/check-attributes.mjs` in the sandbox.
- **Midi-qol automation** (`src/lib/foundryAutomation.js`, editor in `AutomationFields.jsx`): each roll has a collapsed
  "Midi-qol automation" section. Midi-qol 14 details are in the sandbox's `probes/midi-qol-v14-reference.md`.
  - **Target conditions:** guided presets compile to midi condition text.
    - Presets: creature type, HP at most, below half, size, has a condition, failed its save by N, or a custom
      expression.
    - Slots: `useConditionText`, `effectConditionText` (checked per target) and the trigger condition.
    - "Extra damage roll per hit" sets `otherActivityId`.
  - **Over time:** a roll can repeat each turn, using midi's activity over time.
    - The roll gets `isOverTimeFlag`, `overTimeProperties` with `rollAs: "source"` (so the DC stays the NPC's), and an
      `over-time-<id>` identifier. It's marked automation-only and costs nothing.
    - The item's target effect gets a `flags.midi-qol.ActivityOverTime` change naming that roll.
    - The over-time string row is still available, and now writes `saveCount=1-` instead of the deprecated
      `saveRemove`.
  - **Scripts:** activity macros.
    - The code goes in `activity.macroData.command`; the item flag `flags["midi-qol"].onUseMacroName` is set to
      `[pass]ActivityMacro-<id>`. This needs midi-qol only, not DAE.
    - Recipes (`SCRIPT_RECIPES`) regenerate the code until it's edited by hand.
    - **Scripts are JavaScript that runs in the GM's Foundry when the NPC uses the item.** Only DM accounts can write
      NPC drafts (RLS), and Chrab Sync imports them as-is. Review a script before you send it.
  - **Foundry check:** the sandbox's `probes/midi-automation.md` and `scripts/build-automation-probe.mjs`.
- **Spells** (`SpellcastingPanel.jsx`, `src/lib/fiveToolsSpells.js`, spell builders in `foundryActorBuilder.js`):
  - **Where spells come from:**
    - "+ From 5etools" searches the bundled catalog: 580 spells, 2024 versions where reprinted. It's compiled by
      `scripts/5etools-spells/extract.mjs` and lazy-loaded.
    - "Import homebrew spells…" reads a 5etools JSON file.
    - "+ Custom spell" starts from scratch.
  - **Editing:** spells reuse the roll, effect and midi-qol editors.
  - **Casting:** each spell is **At will**, **N per day** (both dnd5e `method: "innate"`, per-day uses recovering
    daily) or **Spell slot** (`method: "spell"`, spends slots).
    - Slots also set `attributes.spell.level` and `spells.spellN.override`.
    - A generated **Spellcasting** feature carries the statblock text. It's placed under Actions (2024 style) or
      Traits (slot casters), and is regenerated on import rather than kept as an item.
  - **Upcasting:** `upcast` becomes `scaling.mode: "whole"` on the first damage or healing part only. Formulas
    that scale themselves (`@item.level`) are left alone, and cantrips scale with the caster.
  - **Foundry check:** the sandbox's `probes/spells.md` and `scripts/build-spell-probe.mjs`.

## Verify

```powershell
git checkout npc-forge
npm install          # no new dependencies were added, but refresh just in case
npm test             # expect: pass 6, fail 0
npm run build        # catches JSX/import errors without a browser - must succeed before merging to main
npx supabase db push # adds npc_drafts (additive only; same Supabase project as the live site)
npm run dev
```

Log in as the DM, then work through these checks.

**List page (`/dm/npc-forge`):**
- [ ] **NPC Forge** appears in the DM subnav and as a card on the DM Dashboard. The list page loads.
- [ ] **Import Foundry NPC** with `src/lib/__fixtures__/kraken.actor.json` creates a draft and opens the editor.

**Imported Kraken:**
- [ ] The preview shows AC 18, HP 481 (26d20 + 208), Initiative +14 (24), CR 23 (PB +7).
- [ ] Saves STR/DEX/CON/WIS are proficient.
- [ ] Truesight is 120 ft. Cold and lightning immunities and four condition immunities are listed.
- [ ] Tentacle, Lightning Strike, Storm Bolt and Toxic Ink are listed, with Legendary Resistance (4/Day) under
      Traits.
- [ ] Editing STR updates Tentacle's to-hit and damage live.

**New NPC:**
- [ ] Add an attack, a save with Recharge, and an effect with a condition and an "Ends" timing.
- [ ] Reorder with ↑/↓ and delete an item.
- [ ] Switch an activity's Kind and an attack between melee and ranged. The fields change accordingly.

**Saving and downloading:**
- [ ] **Save changes** → reload → everything persists.
- [ ] **Save & download Foundry JSON** downloads a file.

**List actions:**
- [ ] **Duplicate** and **Delete** work.

**Layout:**
- [ ] Below about 1100px wide, the statblock stacks under the form.

**Security:**
- [ ] A player account (or logged out) gets no NPC Forge access, and `npc_drafts` returns nothing to non-DMs.

**In Foundry (a test world, not the live one):**
1. Create a blank NPC, then right-click → **Import Data** → pick the downloaded file.
2. Check:
   - [ ] The sheet opens without errors in the browser console.
   - [ ] Attacks and saves roll the numbers the preview showed.
   - [ ] Legendary actions consume `legact`, and Legendary Resistance consumes `legres`.
   - [ ] Effects apply their conditions.
   - [ ] The token size matches the creature's size.
   - [ ] A player can't open the sheet.

## Known limitations (fine for Phase 1)

- Effects carry conditions only. Stat-changing effect `changes` aren't editable yet.
- One damage type per damage row. Add a second row for "plus" damage.
- Importing a monster keeps its descriptions as HTML. The preview strips tags; Foundry renders them normally.
- Telepathy and other special language notes go into the free-text language notes field.
- Art paths are typed by hand (Foundry path or URL). There's no file picker.
