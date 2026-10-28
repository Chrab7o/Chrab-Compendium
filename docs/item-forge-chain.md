# Item Forge: the chain builder (experimental)

Status: started 2026-10-28. It's an experimental page next to the regular editor and can be removed without touching
anything else.

## Why

The Automation Builder's line-by-line script ("if it hits → pick an element → apply the scar") was the easiest part
of the Forge to build with. The rest of a feature was spread over separate steps: Use, Rolls, Effects, Automation.
The chain builder shows a whole feature as one tree, top to bottom, in the order things happen, and every part is
edited in place:

```
Bleeding Scar                                   ← setup: name, how it's used, uses / pool
├ The player chooses
│  ├ Apply
│  │  ├ Costs 1 Ink
│  │  ├ Attack roll · ranged spell · 30 ft
│  │  ├ after the attack roll: if it hit → element = pick of Fire, Cold or Lightning
│  │  ├ Damage 1d8
│  │  ├ when damage is rolled: the damage becomes the type in element
│  │  └ after it's done: if element is Cold → apply Lingering Scar (Cold) [the effect, edited right here]
│  └ Dismiss
│     ├ No roll
│     └ when it's used: Lingering Scar comes off every creature on the map; regain removed Ink
├ Every turn …                                  ← rolls midi repeats each turn
├ Effects not tied to a roll                    ← always on, stance, aura, placed by automation
└ Reactions                                     ← behavior rules
```

## It's a view, not a new format

The chain is worked out from the item's spec every time it's drawn. Edits change the same spec the guided steps and
All fields edit. Nothing new is saved and nothing changes in Foundry, so an item can be opened in either editor at
any time.

| In the chain | In the spec |
|---|---|
| The player chooses → branches | One branch per roll the player can pick (`item.activities`, minus the ones below). dnd5e asks which one when there are several. |
| Then roll … (nested) | `activity.triggerKey` (midi rolls it after this one, against the same targets) |
| Extra damage … (nested) | `activity.otherKey` |
| Every turn … | Rolls with `overTime` (midi repeats them on whoever has the effect) |
| Costs … | `activity.spend` |
| The roll / Damage nodes | The activity's own fields |
| Lines at "when it's used", "after the attack roll"… | `activity.flow` sections, by trigger, shown between the roll's own parts in the order they run |
| On a hit / failed save / the target: effect | Effects whose `appliedBy` is empty or names this roll (not always on, stance, aura or automation-only) |
| An "Apply" line → its effect, nested under it | An automation-only (`byRule`) effect |
| Effects not tied to a roll | Always on, stance, aura, and automation-only effects no line applies |
| Setup / Reactions | The guided steps (`FeatureWizard` with `only`) |

A roll that every branch would reach some other way (a trigger loop) still shows as a choice, so nothing is hidden.

## What's built

- **Page:** `/dm/item-forge/chain/new` and `/dm/item-forge/:id/chain`. It's `FeatureEditor` with `layout="chain"`:
  the same load, save, send, download and preview. The regular editor links to it ("Chain builder (experimental)"),
  it links back, and the library has "+ New (chain, experimental)".
- **`src/lib/forgeChain.js`:** the chain's shape. `chainOf(item)` gives the choices, ticks, `follows` and `extraFor`.
  Also `landsFrom(item, roll)`, `looseEffects(item)` and `flowEffectKeys(item)`. Tested in `forgeChain.test.mjs`.
- **`src/components/dm/feature/ChainBuilder.jsx`:** the tree.
  - Each node folds to one line and opens in place.
  - Each roll has one "+ Add to this roll…" menu: a line at any point of the roll, a cost, an effect when it lands,
    "then roll another", extra damage. It only offers what fits the roll's kind and the item's kind (`forgeKinds.js`).
  - Edits go through `replace(fn)` on the whole spec, so two changes in one click (a new effect plus the line that
    applies it) don't overwrite each other.
- **Shared pieces it needed:**
  - `AutomationWizard.jsx` exports `FlowScope` / `FlowPoint` (one point of a roll's script, inline). The script
    context gained `newEffect` (the apply-effect picker's "+ New effect…") and `afterLine` (the chain nests the
    effect under its line). The dialog is unchanged.
  - `AutomationSection` takes `noFlow` (the chain edits the flow inline).
  - `FeatureWizard` takes `only` (a subset of its steps; one step hides the step bar). It also exports its summary
    helpers.

## Not done yet / ideas

- **Spells** open in the chain (the rolls work the same way), but spell slots and the spell's own range and area
  stay in Setup.
- **Moving a branch**: drag to reorder choices isn't there; the order is the activities' order.
- **Problems** show at the bottom with no "jump to" yet.
- If it sticks: make it the default layout and retire the guided Rolls / Effects steps.

## Rollout plan: the chain builder everywhere (decided 2026-10-28)

The user wants the chain builder to be the way features are built from now on. The guided editor stays reachable
until the last phase, so nothing is lost if a phase goes wrong.

### Phase 1: the class builder imports Forge features (the blocker) (done 2026-10-28)

Built as planned:
- `ForgeFeaturePicker.jsx`, through `RepeatableRows`' `renderAddExtra`, in both `ClassWizard` and
  `StandaloneSubclassEditor`.
- `FeatureMechanics` link fix and `useAutomationOptions().reload`.
- `AddToClass.jsx` on the Forge editor page (both layouts, features only, once saved).
- Pure row logic is in `lib/forgeClassRows.js` (tested). The Supabase half is in `lib/classFeatureLinks.js`.
- "Add to a class" saves the editor's current spec onto the draft, with the class's requirements.
- **Checked:** `npm test` and the build, plus a headless click-through with a fake Supabase.
- **Not yet checked:** a real browser, or a real class save afterwards.

Original plan:

Today a class feature reaches a Forge draft only through "Foundry mechanics → Use an Item Forge item", and only
after you have added and named a row by hand. A feature built in the Forge (Mark of Healing, for Illustrate) has no
direct way in.

- **"+ Add from the Item Forge…"** next to "+ Add Feature", and next to "+ Add sub-feature" under every feature
  (`RepeatableRows`, through a new `renderAddExtra` hook so Feat/Race/Background editors are unchanged). It's a
  searchable picker of feature drafts that shows where each one is already used (`featureDraftLinks`). Picking one
  makes the row with the draft's **name and description copied in** and `feature_draft_id` set. A sub-feature takes
  its parent's level and choice settings, like "+ Add sub-feature".
- **Fix the text overwrite.** A row's name and text replace the draft's when the class saves (`classFeatureSpec`).
  Linking through the existing select now fills a blank name or description from the draft. If both have text and
  it differs, it asks which to keep.
- **The picker list goes stale.** `useAutomationOptions` loads once per page. It reloads when the picker opens, so
  a feature made in another tab shows up.
- The Forge's chain page gets **"Add to a class…"** (class, level, under which feature). That covers the other
  direction: build in the Forge, then attach.

### Phase 2: the chain builder as a piece, not just a page

- `ChainDialog` (like `LibraryItemDialog`): the chain over a spec in a modal, with `onChange` / `onSave`.
- **Class builder:** "Foundry mechanics" shows a one-line chain summary and **"Open in the chain builder"**, which
  opens the dialog and edits the row's mechanics. They are saved with the class, as now. The inline All-fields card
  moves behind an "All fields" toggle.
- **NPC Forge:** `LibraryItemDialog` uses the chain instead of the guided steps.
- **Item Forge:** the chain becomes the default for new and existing items. The guided editor stays one link away
  ("Guided steps").

### Phase 3: a class feature's options in its chain

When a Forge feature is a class feature with sub-features (Illustrate → Bleeding Scar, Mark of Healing), its chain
shows a **"Players pick N of"** node listing them, with "open" on each and "+ Add an option" (a new draft, attached as
a sub-feature). Sub-features that spend the parent's pool say so ("Costs 1 Ink from Illustrate"). This needs the
class link (`featureDraftLinks`) and a write path to `homebrew_class_features` / `homebrew_subclass_features`, then
`republishQuietly`.

### Phase 4: retire the old steps

- Drop the guided Rolls / Effects / Automation steps. `FeatureWizard` keeps Start, Basics, Use and Reactions,
  which the chain's Setup and Reactions nodes already use.
- Spells and gear finish moving in: spell slots, range and area, and gear fields as Setup sub-nodes.
- **All fields** (`ItemCard`) stays as the escape hatch.

## Checked so far (2026-10-28)

- `npm test` (`forgeChain.test.mjs`: choices, nesting, trigger loops, what lands, loose effects) and `npm run build`.
- A headless click-through on the real Bleeding Scar draft:
  - its two rolls become "The player chooses", and the choice names are the roll names;
  - an "after the attack roll" line → "+ New effect…" makes an automation-only effect, nested under the line;
  - "Then roll" a save on a hit nests under Apply;
  - removing Dismiss collapses the branches;
  - the item builds and its flow round-trips.
  - Also: "Something every turn" on a wondrous item, and a new item's start question in Setup.
- **Not yet:** a look in a real browser (layout, spacing on a phone).
