# NPC Forge spell catalog

The NPC Forge's "+ From 5etools" spell picker reads `src/data/spells/catalog.json`. That file is compiled from a local
copy of the [5etools source release](https://github.com/5etools-mirror-3/5etools-src), built against **v2.36.1**,
the same release as `scripts/5etools-items`.

## What's in it

- **Every official source's spells, 580 in all.** Printings a later book supersedes are dropped (5etools marks them
  `reprintedAs`), so a spell reprinted in the 2024 PHB appears only as its XPHB version.
- **Each spell goes through `src/lib/fiveToolsSpells.js` (`prepareFiveToolsSpell`).** That gives:
  - the rules text rendered to HTML
  - the damage, healing and upcast dice
  - saves, spell attacks and conditions
  - the classes that get the spell (from `sources.json`)
- **5etools' own Foundry data** (`spells/foundry.json`, what Plutonium imports) is carried along when it has
  activities. 334 spells have it. The converter prefers it over guessing from tags.

The editor's "Import homebrew spells…" upload runs the same `prepareFiveToolsSpell` on a user's 5etools file, so both
paths read 5etools identically.

## Provenance and credit

**The spell text is Wizards of the Coast's, not ours.** The caveats in `scripts/5etools-items/README.md` apply:

- The catalog ships as a publicly fetchable asset of a static build.
- It's a derived extract of published material, kept for one table's private use.

The catalog is code-split: it loads only when the picker opens.

## Running it

```sh
node extract.mjs                                  # uses the default Downloads path
node extract.mjs path/to/5etools/data             # another release
node extract.mjs path/to/5etools/data out.json    # write somewhere else
```

Re-run it after updating the 5etools release, or after changing `prepareFiveToolsSpell`.
