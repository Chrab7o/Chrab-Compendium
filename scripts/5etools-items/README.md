# Shop item pool

The shop generator at `/dm/shops` rolls its stock from `src/data/shop-items/pool.json`,
compiled from a local copy of the [5etools source release](https://github.com/5etools-mirror-3/5etools-src)
(built against **v2.36.1**).

## Why a local release and not the website

5e.tools is a static single-page app: `items.html` is an empty shell that fetches
`data/items.json` client-side and renders it in the browser. Requesting an item's
URL returns no item text at all, so there is nothing to scrape. The release archive
contains that same JSON, so the local copy is not a workaround — it *is* the source.

## Provenance and credit

**The item text is Wizards of the Coast's, not ours.** The pipeline, the roll logic
in `src/lib/shopPool.js` and the UI are ours; the descriptions are not. The same
caveat as `scripts/name-schemes/README.md` applies, for the same reasons:

- This is a static build, so `src/data/shop-items/pool.json` ships as a publicly
  fetchable asset. `RequireDM` is a client-side route guard — it affects
  discoverability, not reachability.
- The compiled pool is a derived extract of published material kept for one
  table's private use. If this ever needs to move somewhere more public, the
  structure and the roll logic stay; only the text would have to go.

## Running it

```sh
node extract.mjs                                  # uses the default Downloads path
node extract.mjs /path/to/5etools/data            # a different release
node extract.mjs /path/to/5etools/data out.json   # somewhere other than src/data
```

The compiled file is committed, like `src/data/name-schemes/`. Refreshing for a new
5etools release means downloading it and re-running the script — there is no fetch
step to babysit and nothing to break when the site changes.

There is no separate `install.mjs` (unlike `scripts/name-schemes/`): that pipeline
needs the split because it downloads and compiles in separate passes, whereas this
is one local read producing one file.

## What gets included

`extract.mjs` keeps an item only if all four hold:

- `wondrous === true` — the shop this was built for trades in wondrous items
- rarity is uncommon, rare, very rare or legendary
- it has no `reprintedAs`
- its source is in `SETTING_NEUTRAL_SOURCES`

Current output: **328 items** — 94 uncommon, 101 rare, 74 very rare, 59 legendary.

### The `reprintedAs` rule matters

5etools ships 1,680 magic items under only 1,296 distinct names, because XDMG (2024)
reprints most of DMG (2014) verbatim. `reprintedAs` marks the printing that a later
book supersedes, so dropping those keeps exactly one copy of each item at its newest
wording. **Without this filter a single shop can stock "Bag of Holding" twice**, once
from each book.

If the table ever switches back to 2014 rules, invert this: keep the items carrying
`reprintedAs` and drop the XDMG ones.

### Setting-neutral sources

The allowlist is core rules plus the setting-agnostic splatbooks — XDMG, TCE, BMT,
BGG, FTD, XGE, MTF. Everything else in the corpus is either a campaign setting
(Ravnica, Eberron, Theros, Wildemount, Dragonlance) or an adventure set in one,
overwhelmingly the Forgotten Realms, and those items name places that do not exist
in this campaign.

This is a source-level filter, so it cannot catch an otherwise-neutral item whose
*text* name-drops a setting. Exactly one in the current pool does — *Instrument of
the Bards, Fochlucan Bandore*. The shop's per-item "never stock again" list is the
intended fix for stragglers like it, rather than a growing regex here.

## Text conversion

Item `entries` are converted to **markdown**, because the player-facing page renders
them with the same `ReactMarkdown` + `remarkGfm` that entry content already uses.

- 5etools tag markup (`{@item …}`, `{@spell …}`, `{@dice …}` — 25 tag types occur)
  is reduced to its displayed text. Tags nest, so `stripTags` runs innermost-first
  until the text stops changing. `{@b}`/`{@i}` become markdown emphasis.
- Named sub-entries become a run-in bold lead (`**Name.** body`), matching how
  5etools renders them and how the Item Maker writes its feature blocks.
- `table` entries become GFM tables. Cell contents are flattened to one line and
  literal pipes escaped, since either would break the table.
- Files are read and written as explicit UTF-8: the text uses em-dashes and
  typographic quotes that mangle under a default Windows codepage.

Worth re-checking after any 5etools upgrade: the compiled file should contain no
`{@` sequences and no U+FFFD replacement characters.
