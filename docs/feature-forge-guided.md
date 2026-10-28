# Guided Item Forge and the item library

## Goal

Make building a feature feel like the Automation Builder: one question at a time, big choices, only the options that
fit, and a summary at the end. Then restructure so features and NPC items are the same thing: a library of items that
can be put on an NPC or handed to a PC.

## Phase 1: the guided Feature Forge (built)

`/dm/feature-forge/new` and `/:id/edit` open in **Guided** mode. A switch in the header flips to **All fields**, the
old one-page form. Both edit the same spec, so you can switch at any time. The choice is remembered per browser.

**Files:**
- `src/components/dm/feature/FeatureWizard.jsx`: the steps.
- `src/components/dm/feature/FeatureEditor.jsx`: the page (header, save / send, preview), and the mode switch.
- `src/components/dm/npc/ActionBuilder.jsx`: the roll editor is split into exported pieces (`ActivityBasics`,
  `ActivityTargetFields`, `ActivityDamageFields`, `ActivityCostFields`, `AutomationSection`, `useActivityScope`) that
  the dense `ActivityEditor` and the guided roll steps both use. Nothing is duplicated.
- `src/components/dm/npc/BehaviorFields.jsx`: exports `ToggleFields`, `FlavorFields`, `RuleEditor`.

**Steps** (the bar at the top jumps to any of them; Back / Next walk them in order):

| Step | Feature | Spell |
|---|---|---|
| Start (new, blank only) | Blank feature, blank spell, a template, or a Foundry item export | same |
| Basics | Name, feature type, requirements, icon, description | Name, level, school, components, concentration / ritual, description |
| How it's used | Action / bonus / reaction / always on / a stance you toggle; then limited uses (per rest, per day, recharge, a resource pool) | Casting time, range, area, duration, upcasting |
| Rolls | Each roll is a card with its summary. Adding one asks what kind; editing one walks Kind → Targets → Damage / healing → Cost → Automation (the Automation Builder) | same |
| Effects | Each effect is a card. Adding one asks what it is: a condition on the target, a change to the target, a bonus on you, a bonus while the stance is on | same, without the stance |
| Reactions | Behavior rules ("when I hit with a melee attack, I regain…"), chat card look, level tiers | (skipped) |
| Review | Everything in words, with an Edit button per part | same |

A feature linked to a homebrew class keeps its name and description there, so Basics shows only the icon for it.

## Phase 2 and 3: the item library, and the NPC Forge on it (built)

Decided 2026-10-25: items are **linked**, the Feature Forge is renamed the **Item Forge** (and will replace the Item
Maker, phase 4), and legendary / lair actions are ordinary library items placed on the NPC.

- **The library** is the Item Forge (`/dm/item-forge`; old `/dm/feature-forge` links redirect). The table is still
  `feature_drafts`, and Chrab Sync's `sync_pull_features` / `sync_report_feature` are unchanged.
- **An NPC links items**: `spec.items[i] = { key, draftId, section, legendaryCost, itemType }`. The link holds only
  what belongs to that NPC (where it sits on the statblock, a legendary action's cost, "shows in Foundry as a natural
  weapon"). The library item holds everything else.
- **Resolving** (`src/lib/itemLibrary.js`, `resolveNpcSpec`): the NPC editor swaps each link for its library item
  before the preview, the statblock, `buildNpcActor` and the download read the items. To-hit, DCs and damage are baked
  from the NPC's stats exactly as for inline items. The resolved item keeps the link's key, so "also spends" rows
  keep pointing at it.
- **Old NPCs keep working.** An entry without `draftId` is an inline item, edited with the old item card. Each one has
  **Move to library** (saves it as a monster feature and swaps in a link with the same key and placement). No data
  migration.
- **NPC Forge UI** (`npc/ActionBuilder.jsx`, `npc/NpcEditor.jsx`):
  - "+ Add" on a section opens `LibraryPicker`: search the library, or **Build a new item**.
  - New items and **Edit item** open `feature/LibraryItemDialog`: the guided steps in a dialog, previewed against this
    NPC's stats. Saving writes the library item right away. If other NPCs or a homebrew class use it, the dialog
    names them first (and republishes the class pack, as the Item Forge editor does).
  - A linked item's card shows its rolls in this NPC's numbers, its placement fields, a **Changed since this NPC was
    sent** badge (library `spec_updated_at` after the NPC's `queued_at`), **Make a private copy** (inline, unlinked)
    and Remove.
  - Linked items reload when the tab regains focus, so an edit made in the Item Forge in another tab shows up.
  - A link whose library item is gone is reported above the statblock and left out of the build.
- **Item Forge side:** the list shows "On N NPCs" per item and warns before deleting one that NPCs use; the editor has
  an "On <NPC>, <NPC>" banner.
- **Not linked yet:** NPC spells stay in the spellcasting panel as before. Library spells can't be linked onto an NPC.

**Files:** `src/lib/itemLibrary.js` (+ `itemLibrary.test.mjs`, in `npm test`), `src/lib/itemLibraryStore.js`,
`src/components/dm/npc/LibraryPicker.jsx`, `src/components/dm/feature/LibraryItemDialog.jsx`, and changes to
`NpcEditor.jsx`, `ActionBuilder.jsx`, `FeatureEditor.jsx`, `DMFeatureForgePage.jsx`, `App.jsx`, `DMLayout.jsx`,
`DMHome.jsx`, `FeatureMechanics.jsx`.

## Phase 4: the Item Forge replaces the Item Maker (built)

Decided 2026-10-25: Item Maker items are custom, so none go into shops automatically. A shop's price is set on the
shop's own row, as before; the library item has no price.

- **Gear in the library:** a third Item Forge kind, `gear` ("Magic item / gear"), next to features and spells.
  `spec.gear` holds the kind (weapon, armor or shield, wondrous item, consumable) and its dnd5e type, rarity,
  attunement, weight, magic bonus (+1 to +3), weapon properties, armor AC / DEX cap / Strength / Stealth, a
  consumable's "used up when empty", and the written description. Rolls, effects, charges and reactions are the same
  steps as a feature. `buildFeatureItem` builds a dnd5e `weapon`, `equipment` or `consumable` item
  (`lib/foundryFeatures.js`, `buildGearItem`); a weapon's base damage comes from its first attack's first damage
  part. A Foundry weapon / equipment / consumable export loads back into a gear draft.
- **Charges** (any item, features too): uses can now come back at dawn or dusk, come back by a roll ("1d6 + 1"),
  or never come back. New item field `usesRecoverFormula`, and `usesRecovery` gained `dawn`, `dusk` and `none`.
- **The description** is the Item Maker's blocks (named abilities and prose, its light markup), edited in the
  guided **Description** step (and in All fields) with a live preview and **Copy HTML**. The renderer is the Item
  Maker's own, ported to `lib/itemDescription.js` unchanged: the same tooltip-safe HTML. It's the item's Foundry
  description.
- **Shops** list Item Forge gear in "…or from the Item Forge" instead of Item Maker items. Adding one copies its
  name, description (as markdown) and rarity onto the shelf row; set the price there.
- **Import:** **Import from the Item Maker** on the Item Forge list brings every `item_maker_items` row in as a
  wondrous item with its blocks and no rarity (the Item Maker had none). `spec.gear.source.itemMaker` remembers the
  record, so running it again only brings in new ones.
- **Retired:** the Item Maker page, nav link, embedded tool (`components/dm/itemmaker/`) and its storage adapter are
  removed; `/dm/item-maker` redirects to the Item Forge. The `item_maker_items` table is kept for the import. The old
  tool also uploaded items still sitting in a browser's localStorage the first time it opened on that browser; any
  browser that never opened it since the Supabase switch (2026-09-21) would still hold those there.
- **The list** has a filter (Everything, Features, Magic items & gear, Spells) and shows gear as "Rare Martial
  melee", and so on.
- **Chrab Sync:** the Items tab accepts weapon, equipment, consumable and loot items, and labels gear "Item".
- **NPCs** link features only for now; gear is left out of the NPC picker.

**Files:** `src/lib/itemDescription.js`, `src/lib/gearItems.test.mjs` (in `npm test`),
`src/components/dm/feature/GearFields.jsx`, `supabase/migrations/20261103000000_feature_drafts_gear.sql`, and changes
to `foundryFeatures.js`, `foundryActorBuilder.js` (charges), `FeatureWizard.jsx`, `FeatureEditor.jsx`,
`DMFeatureForgePage.jsx`, `DMShopsPage.jsx`, `App.jsx`, `DMLayout.jsx`, `foundry/chrab-sync/scripts/items.mjs` and
`apps.mjs`.

**Setup after merge:**
1. `npx supabase db push` (the migration lets `feature_drafts.kind` be `gear`; saving a magic item fails before it).
2. Let the deploy finish, then **Check for updates** in Foundry so Chrab Sync accepts gear.
3. Item Forge → **Import from the Item Maker**, then give each imported item its kind and rarity.

### Phase 4 checklist

- [ ] **+ New** → a weapon, armor or consumable (was "+ New magic item"): Basics can change the kind; Weapon shows properties and a magic bonus, Armor shows AC fields,
      Consumable shows "used up".
- [ ] Description: add a named ability and text; the preview matches what the Item Maker produced; Copy HTML works.
- [ ] A wand with 7 charges, 1d6 + 1 back at dawn: send it, and in Foundry its uses show 7 with that recovery.
- [ ] A +1 longsword with an attack roll: in Foundry it's a weapon, rare/uncommon as set, +1, and attacks.
- [ ] Import from the Item Maker: every old item appears once; running it again adds nothing.
- [ ] Shops → add stock → "…or from the Item Forge" lists gear; adding one copies name, description and rarity, and
      the price is set on the row.
- [ ] `/dm/item-maker` lands on the Item Forge; the nav has no Item Maker.

## Phase 5: only what fits the kind of thing (built 2026-10-28)

The guided steps used to offer everything everywhere: armor that's a stance, a potion that's always on, a target
condition on an item with nothing to roll. Now you pick what you're making first, and every step offers only the
choices that fit it.

- **One "+ New"** on the library opens Start: "What are you making?". The choices are a feature, a spell, a weapon,
  armor or a shield, a wondrous item, a consumable, or a template. The four gear choices are the gear builder with
  the kind already set. A new weapon starts with an attack roll and as an action. A new consumable starts with one
  charge that's used up. `?kind=spell|weapon|armor|wondrous|consumable` (old `?kind=gear` = wondrous) skips Start. The
  NPC dialog still offers only a feature or a template.
- **The table** is `src/lib/forgeKinds.js` (`FORGE_KINDS`, tested in `forgeKinds.test.mjs`):

  | Kind | How it's used | Uses | Rolls | Effects | Reactions |
  |---|---|---|---|---|---|
  | Feature | all | uses; d6 recharge only for a monster feature | all | all | all events |
  | Spell | (casting) | - | all | on the target, on whoever it's used on | none |
  | Weapon | action, bonus, stance | charges | attack, save, damage, heal, utility | target, while equipped, stance | attack / hit / damage / dealt / failed save / used / turn |
  | Armor or shield | always on, action, bonus, reaction | charges | save, heal, utility | target, while equipped | I take damage / I'd drop to 0 / used / turn |
  | Wondrous | all but a d6 recharge | charges | all | all | all events |
  | Consumable | action, bonus | charges (required) | attack, save, damage, heal, utility | target, on whoever it's used on | none |

  Further narrowed by what the item already is:
  - Target effects only once there's a roll that lands them (a repeat-each-turn tick doesn't count).
  - Stance bonuses only on a stance.
  - No uses question for something always on with nothing to roll.
  - Reaction starts and the rule editor's When / Then lists only show events the kind allows (`RuleEditor` takes
    `events`).
- **Old items keep their choices.** A choice the kind no longer allows still shows, selected, marked "Doesn't usually
  fit ___". Review lists each one (`fitToKind()`), with a **Make it fit** button. Changing a gear item's kind says what
  will change first. "All fields" isn't filtered.
- **A resource pool** (features only) is its own "How it's used" choice. It's an always-on feature whose uses are the
  points (Darkness, Ink). Picking it asks for Points (`@prof`, or a class column `@scale.<class>.<column>`), when they
  refill, and the identifier spenders name. It defaults from the name, and the hint shows where to type it on a
  spender's Cost step. Nothing new in the data: it's shown whenever an item is always on, has uses and has no rolls of
  its own.
- **Something every turn**: on an always-on item or a stance, the Rolls step's first choice. It adds a utility roll
  "Each turn" that repeats at the start of each of the owner's turns while an always-on (or stance) effect is on them.
  The effect is created, named after the item, if there's none. The roll opens at its Automation step, so whatever you
  build there runs each turn. See "Every turn" in `docs/automation-builder.md`.

### Phase 5 checklist

- [ ] **+ New** → Start lists the seven choices; the library has no other New buttons.
- [ ] Armor: How it's used has always on first, no stance, no d6 recharge; Rolls has no attack; Reactions has no
      "extra damage when they hit".
- [ ] Consumable: no always on and no Reactions step; Effects says to add a roll first.
- [ ] Wondrous ring, always on → Rolls → Something every turn → build a pop-up → send it. In Foundry, equip it on a PC
      and start combat: the pop-up shows at the start of that PC's turn, once. Unequip it: it stops.
- [ ] The same on a stance feature: only while the stance is on.
- [ ] Open an old weapon saved as "Always on": it's marked, Review offers Make it fit, and afterwards the attack is an
      action in Foundry.

## Status (2026-10-25)

- Phase 1 built. A headless jsdom click-through (scratch script, not committed) walked a blank spell and Death Stance
  through every step, opened the Automation Builder from a roll, and rendered the All fields form, with no React
  errors.
- Phases 2 and 3 built. `npm run build` passes and `npm test` passes (140). A headless click-through of the NPC Forge
  against an in-memory Supabase stand-in loaded a linked Bite with the NPC's to-hit (+7 for STR 20), added a library
  item to Legendary Actions, edited Bite in the dialog, moved an inline trait to the library, built a new item from
  the picker, saved the NPC (links only), and made a private copy, with no React errors.
- Nothing has been clicked through in a real browser or sent to Foundry yet: see the checklists below.
- Small change to the dense form: in a roll's Midi-qol automation section, the built automation (the Automation
  Builder) now comes first instead of after the aura. The heal formula now sits after the area row.
- Phase 4 built. `npm test` passes (147). A headless click-through built a rare +2 versatile weapon with a named
  ability, charges back 1d6 + 1 at dawn and an attack roll, checked the built Foundry item, and ran the Item Maker
  import twice against a stand-in database (two items in, then nothing new), with no React errors. Not run in a
  real browser or in Foundry yet.

### Phase 1 checklist

- [ ] New feature: Start offers blank / spell / template / import, and each lands on Basics with the right spec.
- [ ] Death Stance template: How it's used shows "A stance", the toggle settings, and `@prof` per long rest; Reactions
      shows its four rules.
- [ ] Add a roll: pick Saving throw, walk the roll steps, and see its summary card. Build automation from the roll's
      Automation step.
- [ ] Add an effect "A bonus while the stance is on": it's created with *While toggled on*.
- [ ] Switch to All fields and back: nothing lost.
- [ ] Spell: Basics and How it's used show the spell fields; Reactions is skipped.
- [ ] Class-linked feature: Basics hides name and description.

### Phase 2 and 3 checklist

- [ ] An existing NPC opens with its inline items unchanged, each with **Move to library**.
- [ ] Move one to the library: it shows in the Item Forge as a Monster feature, "On 1 NPC", and the NPC card turns
      into a linked card in the same section.
- [ ] "+ Add" on Legendary Actions → pick an item → it shows a cost field; the statblock preview lists it.
- [ ] **Build a new item** from the picker, save it: it's linked, and it's in the Item Forge list.
- [ ] Edit a library item used by two NPCs: the dialog names the other one. Open that NPC: the change is there, with
      "Changed since this NPC was sent" if it had been sent.
- [ ] Send an NPC with linked items to Foundry: the actor has them, with this NPC's to-hit and DCs.
- [ ] **Make a private copy**: it turns into a normal item card and the library item is untouched.
- [ ] Delete a library item an NPC uses: the warning names the NPC; the NPC then reports one missing item.
- [ ] `/dm/feature-forge/...` links redirect to `/dm/item-forge/...`.
