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
