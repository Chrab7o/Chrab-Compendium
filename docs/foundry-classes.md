# Foundry classes: homebrew classes as a native compendium

## What this is

Every **public homebrew class and subclass** goes to Foundry as native dnd5e items, with the automation of linked
Feature Forge features. Chrab Sync loads them into a world compendium, **Chrab Corner Classes**. From there:
- **Players** drag a class onto their sheet and level up with the sheet's own level-up button. dnd5e walks them
  through hit points, proficiencies, features, choices (the Dark Arts picks) and the subclass.
- **The GM** clicks **Sync classes** after the site changes. Copies already on characters update in place.

No Plutonium and no URL to paste. This replaced the Plutonium feed on 2026-10-24. Plutonium could only import a class
in one go, and it got choices and subclass headers wrong. The **Export to 5etools** button in the class editor still
writes a text-only 5etools file.

## How it fits together

```
Class / subclass editor ─ save ─┐
Feature Forge (linked) ── save ─┼─▶ lib/foundryClassPackPublish.js (DM's browser)
Homebrew page ─ Publish now ────┘      loads public classes + subclasses + linked drafts
                                        buildClassPack (lib/foundryClassPack.js)
                                        upload ─▶ storage foundry-feed / chrab-classes.json (public read, DM write)
Foundry: Chrab Sync ─ Classes tab ─ Sync classes ─▶ that file ─▶ world compendium "Chrab Corner Classes"
                                                              └▶ characters' copies (optional)
```

**Why it's built in the browser and not by a server function:** the pack reuses the Feature Forge item builder
(`buildFeatureItem`) and the class form helpers, both plain JS already running on the site. A DM session can read the
DM-only drafts, and storage policy lets only DMs write the file.
- The trade-off: the file changes only when a DM saves something on the site, or presses **Publish now**.
- So a change made straight in SQL (a migration) needs a **Publish now** afterwards.

## What goes in the file

`{ format: "chrab-class-pack", version: 1, generatedAt, pack, folders, items, summary }`. The items are ready to
create in a compendium as they are.

| Site | Foundry (dnd5e 5.3.3) |
| --- | --- |
| Public `homebrew_classes` | A `class` item, identifier = the slugged name (`the-dark-knight`). It's in a folder named after the class. |
| Hit die, primary ability, spellcasting | `system.hd`, `system.primaryAbility`, `system.spellcasting` (the progression as stored: full / half / third / pact). |
| Saves, skill choices, armor, weapons | `Trait` advancements at level 1. Saves and skills are `classRestriction: primary`, like dnd5e's own classes. Only the standard terms map (light/medium/heavy/shields, simple/martial). Firearms, tools and the like stay in the class text. |
| A feature row | A `feat` item (class feature). It's granted by an `ItemGrant` advancement at its level. |
| A feature row linked to a Feature Forge draft | The draft's whole built item: activities, effects, uses, flags, macros. The row's name and text replace the draft's. |
| A choice group (`choice_group` + `choice_count`) | An `ItemChoice` advancement at that level: "choose *count* from this pool". The intro feature (Dark Arts) is granted. `choice_count` 0 grants every option instead. |
| An "Ability Score Improvement" / "Ability score increase" row | An `AbilityScoreImprovement` advancement at that level (2 points, or a feat). No feature item. |
| The first `subclass_levels` entry | One `Subclass` advancement. Later subclass levels are the subclass's own grants. |
| Class table columns | `ScaleValue` advancements: `@scale.<class>.<column>`, e.g. `@scale.the-dark-knight.darkness-points`. All-number columns become a number scale, `1d8`/`d8` columns a dice scale, and anything else a string scale. `-` and blanks are skipped. |
| Public subclasses | A `subclass` item, `classIdentifier` = the class's identifier. Its features are granted by its own `ItemGrant`s. |
| Public standalone subclasses (`parent_class_name`) | A `subclass` item with `classIdentifier` = the slugged parent name (`cleric`), so dnd5e offers it under the official class. Spell the parent exactly as dnd5e does. |

**Stable ids.** Every id is derived from what the document is, so a republish keeps the same ids:
- a class or subclass: its row id
- a feature: its owner, level and name
- an advancement: its owner, type, level and title

That keeps the advancements' UUIDs (`Compendium.world.chrab-classes.Item.<id>`) valid, and lets Chrab Sync find the
copies on characters. Renaming a class keeps its id. Renaming a feature, or moving it to another level, makes it a new
item: characters who already have the old one keep the old version.

**`flags.chrab-sync.packItem`** on every item is that id. Characters' copies keep it, which is how **Also update
copies** finds them. Linked features also keep `featureDraftId`, so the Items tab's **Also update copies** finds them
too.

**The Darkness pool:** the Dark Arts feature's mechanics carry it, with uses max
`@scale.the-dark-knight.darkness-points`, long-rest recovery and identifier `darkness`. Every Dark Art spends
`itemUses` from target `darkness`. dnd5e re-links an identifier target to the item on each character, so it works
whatever ids the character's copies get.

## Using it

**One-time setup:**
1. Merge and let the deploy finish. No migration: the file goes in the existing `foundry-feed` bucket.
2. On the site: **DM → Homebrew → Classes → Publish now**.
3. In Foundry, update Chrab Sync to 0.2 (Setup → Add-on Modules → Check for updates).
4. Open **Chrab Sync** from the Items or Compendium sidebar. Go to **Classes** and click **Sync classes**. This creates
   the **Chrab Corner Classes** compendium: locked, players can view it.

**Giving a feature mechanics:** open the class editor's **Foundry mechanics** panel on the feature row. To load a
whole class's set at once, use **Load mechanics** with a class mechanics file (`src/lib/classMechanicsFile.js`). The
sandbox's `build-dark-knight-probe.mjs` writes `samples/dark-knight-mechanics.json`. Then **Save Class**: each row's
mechanics become its linked Feature Forge draft, and the class pack republishes.

**A player taking a class:**
1. Open the compendium (Compendium sidebar → Chrab Corner Classes) and drag the class onto the character sheet.
2. dnd5e's advancement window asks for hit points, skills and so on, then grants the level 1 features.
3. **Level up** from the sheet (the class's level arrow, or the level-up button). Each level grants that level's
   features and asks for choices: the Dark Arts at 2, 6 and 11, the subclass at 3 (dnd5e's picker lists this
   compendium's subclasses for the class) and ability scores at 4.

**After changing a class on the site:** saving publishes. In Foundry, Chrab Sync shows **Classes (new)** and a
notification at GM login. Click **Sync classes**.
- **Also update copies** (on by default) refreshes features already on characters. It keeps their spent uses and
  dnd5e's record of which advancement granted them.
- Class and subclass copies get the new advancements but keep what the character already chose, plus their levels
  and spent hit dice. So later level-ups use the current class.
- **Not retroactive:** a feature added at a level a character has already passed isn't granted to them. Drag it from
  the compendium onto the sheet. This is the same as dnd5e's own classes.

**Testing a class before publishing:** Chrab Sync → Classes → **Load a file…** takes a class pack file from disk
instead of the published one. The sandbox's `node scripts/build-dark-knight-probe.mjs ../Chrab-Corner samples` writes
`samples/dark-knight-class-pack.json`: the live Dark Knight with every sandbox automation attached. **Refresh** goes
back to the published file.

## Security

- **The file is public**, like the class pages it's built from. It also contains the **automation scripts** of linked
  features (readable, not runnable by anyone outside your world).
- **Left out:** DM-only classes and subclasses, unlinked Feature Forge drafts, and spells.
- **Writing:** only DMs can write the bucket (`is_dm()` storage policies). Players and the sync account can't.
- **In Foundry:** only a GM can sync. Players get observer access to the compendium, which is enough to drag from it.

## Files

| Path | What |
| --- | --- |
| `src/lib/foundryClassPack.js` + `.test.mjs` | `buildClassPack`, `tableColumnScaleValue`, `markdownToHtml`, `stableId`, `classPackSummary`. Pure. The test file also covers the mechanics helpers and the 5etools export. |
| `src/lib/foundryClassPackPublish.js` | Loads from the database, builds and uploads (`publishClassPack`). `republishQuietly` for save paths, `featureDraftLinks`, `fetchPublishedClassPack`. |
| `src/pages/dm/DMHomebrewPage.jsx` | The **Foundry classes** panel. Republishes after a delete. |
| `ClassWizard.jsx`, `StandaloneSubclassEditor.jsx`, `FeatureEditor.jsx` | Republish after a save. |
| `src/components/dm/homebrew/FeatureMechanics.jsx`, `mechanics.js` | The per-row **Foundry mechanics** panel and saving rows' mechanics as drafts. |
| `foundry/chrab-sync/scripts/classes.mjs` | `fetchClassPack`, `syncClassPack` (fill the compendium, refresh copies), `checkClassPack` (login notice). |
| `foundry/chrab-sync/scripts/apps.mjs` | The **Classes** tab. |
| `supabase/migrations/20261102000000_homebrew_foundry_feed.sql` | `feature_draft_id` on the feature tables, and the `foundry-feed` bucket and its policies. Unchanged. The old `chrab-homebrew.json` in the bucket is no longer written and can be deleted. |

## Verify

```powershell
npm test        # expect: pass 123, fail 0
npm run build
```

**Before deploying** (sandbox file, any world with Chrab Sync from this branch):
- [ ] Chrab Sync → Classes → **Load a file…** → `samples/dark-knight-class-pack.json`. It reads "1 class, 3
      subclasses, 43 features (34 automated)".
- [ ] **Sync classes**: Chrab Corner Classes appears in the Compendium sidebar. It has a "The Dark Knight" folder with
      the class, 3 subclasses and the features.
- [ ] As a **player** account: the compendium opens, and the class can be dragged onto their own character.
- [ ] On a fresh character, drag in **The Dark Knight**. Level 1: hit points, 2 of the 4 skills, Fighting Style and
      Tainted Soul.
- [ ] Level to 2: Dark Arts and Soul Surge are granted, then a **choose 2** from the 7 arts. Only the 2 picked are added.
  - **Dark Arts** shows Darkness uses = 9 and refills on a long rest.
  - Shadow Lance attacks at prof + CON and spends 3 Darkness.
- [ ] Level to 3: the subclass step lists Vanguard, Harbinger and Magus. Harbinger gives **Death Stance**, which works
      as in `probes/death-stance.md`.
- [ ] Level to 4: the ability score step. Level to 6: Darkness becomes 12, plus a choose-1 from the level 6 arts.
- [ ] Change a Dark Art's text in the file, load and sync again with **Also update copies** ticked. The character's
      copy has the new text and keeps its spent uses.

**After deploying:**
- [ ] **Homebrew → Classes → Publish now** says "Live: 7 classes, 17 subclasses, … features (N automated)".
- [ ] Chrab Sync → Classes shows the published file, and **Sync classes** works the same.
- [ ] The Godless Domain is offered when a Cleric reaches level 1's subclass step (with the SRD Cleric).

## Known limitations

- **Dark Arts swaps:** the text lets players swap an art on level-up. The choices are set up without dnd5e's
  "replacement" option for now, so swap by hand (delete one, drag another from the compendium). A per-group
  "can swap on level-up" setting in the class editor would turn it on.
- **Fighting Style** is a text feature. Its options aren't separate rows yet.
- **Tools** and non-standard weapon or armor proficiencies stay text.
- **Row limits:** each table is read in one request (PostgREST's default page is 1000 rows). That's far above
  today's content.
