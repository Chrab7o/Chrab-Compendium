# Plutonium feed: homebrew classes in Foundry

## What this is

One public URL that serves **every public homebrew class and subclass** as a single 5etools homebrew file, including
the Foundry automation of linked Feature Forge features. In Foundry, Plutonium's class importer loads it as a
**Custom URL**. Class imports and level-ups then always get the current version of the classes.

The pieces:
- **Linking:** each class or subclass feature row can name the Feature Forge draft that automates it. This is the
  "Foundry automation" picker in the class and subclass editors.
- **Publishing:** saving a class, a subclass or a linked feature rebuilds the file and uploads it. So does the
  **Publish now** button on the Homebrew page (Classes or Subclasses tab).
- **Importing:** Plutonium creates the class with its level-up choices, Dark Arts picks and so on. It merges each
  linked feature's Foundry data (activities, effects, flags, uses) onto the feature it creates. The text stays the
  class's own.

This was proven on 2026-10-23: a Plutonium import of a test Dark Knight gave a fully working Death Stance. See the
sandbox's `probes/plutonium-class-import.md`.

## How it fits together

```
Class / subclass editor ─ save ─┐
Feature Forge (linked) ── save ─┼─▶ lib/homebrewFeedPublish.js (DM's browser)
Homebrew page ─ Publish now ────┘      loads public classes + subclasses + linked drafts
                                        buildHomebrewFeed (lib/homebrewFeed.js)
                                        upload ─▶ storage bucket foundry-feed / chrab-homebrew.json (public read, DM write)
Foundry: Plutonium ─ Custom URL ─▶ that file
```

**Why it's built in the browser and not by a server function:** the feed reuses the site's own 5etools exporter
(`classFormToFiveToolsJson`) and the Feature Forge item builder (`buildFeatureItem`). Both are plain JS already running
on the site. A DM session can read the DM-only drafts, and storage policy lets only DMs write the file.
- The trade-off: the file changes only when a DM saves something on the site, or presses **Publish now**.
- So a change made straight in SQL (a migration) needs a **Publish now** afterwards.

## What goes in the file

| Site | 5etools / Foundry |
| --- | --- |
| Public `homebrew_classes` (+ features, table) | `class`, `classFeature`, exactly as **Export to 5etools** writes them. The source is the class's initials (`TDK`). |
| Public subclasses of those classes | `subclass`, `subclassFeature`. A subclass of a hidden class is left out. |
| Public standalone subclasses (`parent_class_name`) | `subclass` with `className` = the parent's name and `classSource: "PHB"`, so Plutonium attaches it to the official class. Spell the parent exactly as 5etools does ("Cleric"). |
| A feature row's `feature_draft_id` | A `foundryClassFeature` / `foundrySubclassFeature` entry with the same `name`, `source`, `className`, `classSource`, `level` (+ `subclassShortName`, `subclassSource`). It carries the built item's `activities`, `effects`, `flags`, `img` and `system.uses` / `requirements` / `type`, but not its description. |
| Class table columns | `foundryAdvancement` ScaleValues on the class: `@scale.<class>.<column>`, e.g. `@scale.the-dark-knight.darkness-points`. All-number columns become a number scale, `1d8`/`d8` columns a dice scale, and anything else a string scale. `-` and blanks are skipped. |
| Feature Forge draft id | `flags.chrab-sync.featureDraftId` on the overlay. Characters' copies keep it, so Chrab Sync's **Also update copies** can find them. |

A choice option (one of the Dark Arts) can be linked like any feature. It's its own `classFeature`, and the
overlay matches it.

## Using it

**One-time setup:**
1. Merge, then run `npx supabase db push`. This adds the link columns and the `foundry-feed` bucket.
2. Let the deploy finish.
3. On the site: **DM → Homebrew → Classes → Publish now**, then **Copy URL**.
4. In Foundry: open Plutonium's class importer, choose **Custom URL**, and paste the URL. Plutonium remembers custom
   sources it has loaded. If your version keeps a list of additional homebrew sources in its settings, add it there
   too.

**Automating a feature:**
1. Build it in the **Feature Forge** (or use one you have).
2. Open the class (or standalone subclass) editor, find the feature row, and pick the item under **Foundry
   automation**. Save. The feed republishes.
3. Characters who level into the feature from now on get the automated version from Plutonium.

**Changing it later:**
- **Text:** edit the class. **Automation:** edit the Feature Forge item. Either save republishes the feed. A feature
  save republishes only when some class links it.
- **Characters who already have it:** Plutonium never touches features a character already has. On the Feature
  Forge item, use **Send to Foundry**. In Foundry, open **Chrab Sync → Items**, tick **Also update copies**, and click
  **Apply**. Copies are found by `featureDraftId`, so Plutonium-imported copies are included. Spent uses are kept.

## Security

- **The file is public**, like the class pages it's built from. It also contains the **automation scripts** of linked
  features (readable, not runnable by anyone outside your world).
- **Left out:** DM-only classes and subclasses, unlinked Feature Forge drafts, and spells.
- **Writing:** only DMs can write the bucket (`is_dm()` storage policies). Players and the sync account can't.

## Files

| Path | What |
| --- | --- |
| `supabase/migrations/20261102000000_homebrew_foundry_feed.sql` | `feature_draft_id` on `homebrew_class_features` and `homebrew_subclass_features` (on delete set null). The `foundry-feed` bucket and its policies. |
| `src/lib/homebrewFeed.js` + `.test.mjs` | `buildHomebrewFeed`, `foundryOverlay`, `tableColumnScaleValue`, `feedSummary`. Pure. |
| `src/lib/homebrewFeedPublish.js` | Loads from the database, builds and uploads (`publishHomebrewFeed`). `republishQuietly` for save paths, `isFeatureDraftLinked`, `homebrewFeedUrl`, `fetchPublishedFeed`. |
| `src/lib/homebrew.js` | `subclassToFiveTools` split out of the class exporter, so standalone subclasses reuse it (class exports are byte-identical). The form state carries `feature_draft_id`. |
| `src/components/dm/RepeatableRows.jsx` | `automationOptions` adds the **Foundry automation** picker to rows and sub-features. |
| `ClassWizard.jsx`, `StandaloneSubclassEditor.jsx`, `useAutomationOptions.js` | Pickers, saving the link, republishing after a save. |
| `src/pages/dm/DMHomebrewPage.jsx` | The **Plutonium feed** panel. Republishes after a delete. |
| `src/components/dm/feature/FeatureEditor.jsx` | Saving a linked feature republishes. |

**Sandbox:** `scripts/build-feed-preview.mjs` builds the feed from the live site's public data. It attaches the
template Death Stance to every "Death Stance" row, because drafts are DM-only, and writes
`samples/chrab-homebrew-preview.json`. Use it to check a change in Plutonium before deploying.

## Verify

```powershell
npm test        # expect: pass 53, fail 0
npm run build
```

- [ ] **Homebrew → Classes** shows the Plutonium feed panel. **Publish now** says "Live: 7 classes, 17 subclasses, …".
      The URL opens the JSON in a new tab.
- [ ] **The Dark Knight → Subclasses → Harbinger of Darkness → Death Stance:** pick the Feature Forge Death Stance
      under Foundry automation and save. The panel shows 1 automated feature.
- [ ] Hide a subclass (DM only) and save: it disappears from the file.
- [ ] A player account can't upload to the bucket (the storage API returns 403).
- [ ] **Foundry, in a test world:**
  - Plutonium → Custom URL → the URL.
  - Import The Dark Knight to level 3 with Harbinger: Death Stance works as in the probe.
  - `@scale.the-dark-knight.darkness-points` shows 9 in a roll at level 3.
  - The Godless Domain shows up under the Cleric.

## Known limitations

- **Sources are initials.** "Desperado" is `D` and "The Dark Knight" is `TDK`. Two public classes with the same
  initials share a source, which is fine as long as their names differ. Renaming a class changes its source, and
  Plutonium then treats it as a new class.
- **Text-only download:** the editor's **Export to 5etools** button still downloads text only. The feed is the version
  with automation.
- **Row limits:** each table is read in one request (PostgREST's default page is 1000 rows). That's far above
  today's content.
