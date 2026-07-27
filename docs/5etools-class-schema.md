# 5etools homebrew class/subclass JSON — reference notes

Researched from `classes/*.json` (18 real homebrew files, mostly LaserLlama's
"Alternate ___" series plus several other authors) and the authoritative
schema at `TheGiddyLimit/5etools-utils` (`schema/site/class/class.json`,
`schema/site/entry.json`, `schema/site/optionalfeatures.json`).

**Both directions now exist**, in `src/lib/homebrew.js`, wired to buttons on
`ClassWizard.jsx`:
- `classFormToFiveToolsJson()` — "Export to 5etools" (shown when editing an
  existing class). Verified against a real converted class (The Dark
  Knight) by comparing the output field-by-field against the real sample
  files in `classes/` rather than formal JSON-Schema validation — the
  schema declares draft 2020-12 and the readily-available `ajv-cli` tooling
  only supports draft-07/2019-09, so a from-scratch Ajv v8+ setup would be
  needed to validate this automatically in the future.
- `fiveToolsJsonToClassForm()` — "Import from 5etools" (shown on the "new
  class" screen). Reads defensively: real homebrew files are messier than
  our own export (see `classes/Done.json`'s Desperado class for a real
  example — a `class.name` that doesn't match its own features'
  `className`, a duplicated feature reference that silently drops a whole
  level's content if you trust the reference array, subclass features
  whose `subclassShortName` doesn't match any actual feature it's
  supposedly attached to). The importer reads feature content straight from
  the flat `classFeature`/`subclassFeature` arrays rather than trusting the
  `classFeatures`/`subclassFeatures` reference-string arrays to be
  internally consistent, and resolves subclass features by name+level only
  (not the full compound key) for the same reason. It also detects "2+
  named nested `entries` sections inside one feature" as a choice group and
  splits it into our `choice_group`-tagged rows automatically (this is what
  turned Desperado's "Desperado Specialty"/"Specialty Upgrade"/"Scrappy"/
  "Final Specialty Upgrade" features into properly-boxed choice groups on
  import, with zero manual work).

One file in `classes/` (`MCDM Productions; Where Evil Lives.json`) is a full
adventure book with no class content — ignore it for this purpose.
`Rain-Junkie, DXHHH101; Orchard Origin Sorcerer, Reflourished.json` has no
`class[]` array at all — it's a subclass-only addition to the officially
published Sorcerer, useful as a reference for how a subclass stands alone
without redefining its parent class.

## Top-level file shape

A homebrew file is one JSON object with a `$schema` pointer (usually
`.../schema/brew-fast/homebrew.json`), a `_meta` block, and flat top-level
arrays — there's no nesting of subclasses inside classes or features inside
either; everything is a flat array cross-referenced by name/level strings.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/TheGiddyLimit/5etools-utils/master/schema/brew-fast/homebrew.json",
  "_meta": { "sources": [ /* see below */ ], "dependencies": {...}, "edition": "classic" },
  "class": [ /* usually exactly 1 */ ],
  "subclass": [ /* 0+ */ ],
  "classFeature": [ /* every base-class feature, flat */ ],
  "subclassFeature": [ /* every subclass feature, flat, from every subclass */ ],
  "classFluff": [ /* optional flavor text/image, separate from mechanical class */ ],
  "optionalfeature": [ /* reusable picks: fighting styles, invocations, exploits, etc */ ],
  "foundryClassFeature": [ /* optional: Foundry VTT mechanical overlay per feature */ ],
  "foundrySubclassFeature": [ /* same, for subclass features */ ]
}
```

### `_meta.sources[]`

```json
{
  "json": "LLAClr",           // short code = the "source" value used everywhere else in this file
  "abbreviation": "LLAClr",
  "full": "Alternate Cleric",
  "url": "https://www.gmbinder.com/...",
  "version": "1.1.0",
  "authors": ["LaserLlama"],
  "convertedBy": ["Dazzle"],
  "color": "bfb8ad"
}
```

The `json`/`abbreviation` code (here `"LLAClr"`) is what every `source`,
`classSource`, `subclassSource` field in the rest of the file actually
contains — **not** the class's display name. Every homebrew file mints its
own unique source code.

## `class` object

One object per class (there's almost always exactly one per file). Key
fields, grouped:

**Identity**: `name`, `source` (→ the file's source code).

**Hit points**: `hd: { number: 1, faces: 8 }` — always `number: 1` for a
single class hit die.

**Proficiencies**:
- `proficiency: ["wis", "cha"]` — saving throw proficiencies, ability
  abbreviations (`str`/`dex`/`con`/`int`/`wis`/`cha`).
- `startingProficiencies: { armor: [...], weapons: [...], tools: [...], skills: [{ choose: { from: [...], count: 2 } }] }`
  — armor/weapons are string arrays of plain proficiency names (`"light"`,
  `"medium"`, `"heavy"`, `"shield"`, `"simple"`, `"martial"`); skills use a
  `choose.from`/`choose.count` shape rather than a flat list.
- `primaryAbility: [{ str: true }]` or similar — array of single-key objects,
  supports multiple qualifying abilities.

**Starting equipment**: `startingEquipment.default` is an array of
human-readable strings (one per bullet, with inline `{@item name|source}`
tags); `startingEquipment.defaultData` is a **parallel, structured** array
for programmatic tools — `{a: [...], b: [...], c: [...]}` per equipment
choice, or `{_: [...]}` for a non-choice bundle. Both are populated; the
prose array is source-of-truth for display, the structured one for tooling.

**Multiclassing**: `multiclassing: { requirements: { wis: 13 }, proficienciesGained: { armor: [...], weapons: [...] } }`.

**Spellcasting** (all optional, omitted entirely for non-casters):
- `spellcastingAbility`: ability abbreviation.
- `casterProgression`: enum `"full" | "1/2" | "1/3" | "pact" | "artificer"`.
- `cantripProgression`: **exactly 20 integers**, one per character level 1–20.
- `preparedSpells`: formula string with placeholders, e.g.
  `"<$level$> + <$wis_mod$>"`.
- `spellsKnownProgression` / `spellsKnownProgressionFixed`: 20-integer arrays
  for known-spells casters (Sorcerer-style) vs fixed lists (Warlock-style).
- `classSpells`: flat array of every spell name in the class's spell list
  (own list, distinct from the core PHB list) — `"spell name"` or
  `"spell name|source"` when the spell itself is homebrew.

**Special per-level table columns** — `classTableGroups`, an array where each
entry is one extra column-set on the class's level-progression table:
```json
{
  "colLabels": ["Cantrips Known", "Channel Divinity"],
  "rows": [ [2, "-"], [2, "-"], [2, 2], ... ]   // one row per level 1-20, one cell per column
}
```
or, for spell-slot tables specifically:
```json
{
  "title": "Spell Slots per Spell Level",
  "colLabels": ["1st", "2nd", ..., "9th"],
  "rowsSpellProgression": [ [2,0,0,...], [3,0,0,...], ... ]  // 20 rows x up to 9 columns
}
```
**This maps directly onto this app's `homebrew_class_table_columns` +
`homebrew_class_table_values`** — one `classTableGroups` entry ≈ one or more
of our columns, `rows`/`rowsSpellProgression` ≈ our per-level `value` cells.
Our schema stores one column per row rather than grouping multiple columns
under one `classTableGroups` block with a shared title, but a straight
column-by-column export (one `classTableGroups` entry per column, no shared
title, `rows` as `[[value], [value], ...]`) round-trips fine.

**`classFeatures`** — the level-by-level feature list, NOT inline objects.
Each entry is either:
- a plain reference string: `"Feature Name|Class Name|ClassSource|Level"`
  (source defaults to PHB if a 4th segment is omitted, but homebrew always
  includes it), or
- an object `{ "classFeature": "same string as above", "gainSubclassFeature": true }`
  when that level is when the subclass grants a feature (this is how the
  file says "the subclass plugs in here" without embedding subclass content
  in the base class's own list).

The actual feature **content** lives in the separate top-level `classFeature`
array, cross-referenced by that same pipe-delimited string — see below.

**`subclassTitle`**: display label for what the subclass choice is called
(`"Divine Domain"`, `"Martial Archetype"`, `"Sacred Oath"`, etc.) — this is
exactly our `homebrew_classes.subclass_label`.

**`foundryAdvancement`** — Foundry-VTT-specific per-level mechanics
attached directly to the class (separate from the per-feature
`foundryClassFeature` overlay below). The relevant type for our purposes is
`ScaleValue` — a value that grows by level, e.g.:
```json
{
  "type": "ScaleValue",
  "configuration": { "identifier": "channel-divinity", "type": "number",
    "scale": { "2": { "value": 2 }, "7": { "value": 3 }, "15": { "value": 4 } } },
  "title": "Channel Divinity"
}
```
This is the Foundry-side equivalent of a `classTableGroups` column — our
`homebrew_class_table_columns`/`values` maps onto **both** targets from the
same source data (a 5etools column export + a Foundry `ScaleValue`
advancement export are two different renderings of the same
column-of-numbers-by-level).

## `subclass` object

```json
{
  "name": "Death", "shortName": "Death", "source": "LLAClr",
  "className": "Alternate Cleric", "classSource": "LLAClr",
  "subclassFeatures": [
    "Death Domain|Alternate Cleric|LLAClr|Death|LLAClr|2",
    "Doomed to Die|Alternate Cleric|LLAClr|Death|LLAClr|3"
  ],
  "additionalSpells": [{ "known": { "2": ["false life", "healing word"], "3": [...] } }],
  "subclassSpells": ["false life", "healing word", ...]
}
```

- `shortName` is a second identifier (distinct from `name`) used as part of
  the subclass-feature reference key. Across the sampled files it's usually
  just `name` verbatim, or `name` with a common thematic prefix stripped —
  `"Path of Blood & Iron"` → `"Blood & Iron"`, `"Order of Alchemists"` →
  `"Alchemist"`, `"Calling of the Poltergeist"` → `"Poltergeist"`, `"The
  Astral Plane"` → `"Astral"`. Our schema has no equivalent field; deriving
  one on export by stripping a leading `"Path of "`/`"Order of "`/`"Circle of
  "`/`"Oath of "`/`"The "`/`"Way of "` (case-insensitive) and falling back to
  the full name is a reasonable heuristic.
- A subclass can also be a **re-parenting of an existing (non-homebrew)
  subclass** onto a new homebrew class via `_copy`, e.g.:
  ```json
  { "source": "...", "className": "Sorcerer, Revitalized", "classSource": "...",
    "_copy": { "name": "Aberrant Mind", "source": "TCE", "shortName": "Aberrant Mind",
               "className": "Sorcerer", "classSource": "PHB" } }
  ```
  This avoids redefining an official subclass's features when a homebrew
  class is meant to stay compatible with it. Not relevant to our exporter —
  every subclass built through our wizard is original content with its own
  full feature set, never a reference to official 5etools content.
- `subclassFeatures` reference format has **two more segments** than a plain
  class feature reference: `Name|ClassName|ClassSource|SubclassShortName|SubclassSource|Level`.
- Subclasses can override `casterProgression`/`spellcastingAbility`/the
  spell-progression arrays independently of the parent class (for casters
  like Warlock patrons that don't all cast the same way) — not used by any
  of our classes yet, but the field names are identical to the class-level
  ones if ever needed.
- `additionalSpells`/`subclassSpells` are how a subclass grants "always
  prepared" or "expands your list" spells per level — no equivalent in our
  schema currently.

## `classFeature` / `subclassFeature` objects

Both are flat top-level arrays, one object per feature, cross-referenced by
the pipe-delimited strings in `classFeatures`/`subclassFeatures` above.

```jsonc
// classFeature
{
  "name": "Sacred Calling", "source": "LLAClr",
  "className": "Alternate Cleric", "classSource": "LLAClr",
  "level": 1,
  "entries": [ /* see below */ ]
}

// subclassFeature - same shape, plus subclass linkage instead of a plain level match
{
  "name": "Grave Guardian", "source": "LLAClr",
  "className": "Alternate Cleric", "classSource": "LLAClr",
  "subclassShortName": "Death", "subclassSource": "LLAClr",
  "level": 2,
  "entries": [ ... ]
}
```

A feature name is **not** unique by itself — e.g. "Domain Feature" repeats at
levels 3/6/8/17 in the Cleric class list, each as a separate `classFeature`
object with the same name but a different `level`. The reference string
(name+className+classSource+level) is the real identity, not the name
alone.

## `entries` — the rich-text format

This is the one place our plain-markdown `description` field and 5etools'
format diverge the most, and the part an exporter has to actually transform
rather than just rename fields.

An entry is **either a plain string** (with inline `{@tag ...}` markup, see
below) **or an object with a `type`**. The array mixes both freely, in
order. Types actually seen in real class content:

| type | shape | notes |
|---|---|---|
| *(plain string)* | `"some text {@i emphasis} more text"` | most feature text is just this |
| `"entries"` | `{ type: "entries", name: "...", entries: [...] }` | a named sub-section, nests recursively |
| `"list"` | `{ type: "list", items: [...] }` | items are themselves entries (usually strings) |
| `"table"` | `{ type: "table", colLabels: [...], colStyles: [...], rows: [[...]] }` | a real table, each cell is an entry |
| `"options"` | `{ type: "options", count: 1, entries: [{ type: "refClassFeature", classFeature: "Name\|Class\|Source\|Level" }, ...] }` | **the "choose one/some of these" construct** — see below |
| `"refClassFeature"` | `{ type: "refClassFeature", classFeature: "..." }` | pulls in another `classFeature` object's own `entries` inline, by reference |
| `"refSubclassFeature"` / `"refOptionalfeature"` | same shape, field named `subclassFeature` / `optionalfeature` | same reference-pointer idea, for the other two feature arrays |
| `"inset"` | `{ type: "inset", name: "...", entries: [...] }` | a boxed callout |

### How 5etools represents a "choice group" (our `choice_group`)

This app's `choice_group` field (added for things like the Dark Knight's
"pick 2 Dark Arts") has a direct, more-structured 5etools equivalent:

1. Each option becomes its **own separate `classFeature` object** at the
   relevant level (own `name`, own `entries`) — same as any other feature.
2. The "intro" feature at that level (the one explaining the mechanic) ends
   its `entries` array with an `options` block whose `entries` are
   `refClassFeature` pointers into those separate objects:
   ```json
   { "type": "options", "count": 2, "entries": [
     { "type": "refClassFeature", "classFeature": "Restore Vitality|Alternate Dark Knight|HB|2" },
     { "type": "refClassFeature", "classFeature": "Enthrall|Alternate Dark Knight|HB|2" }
   ]}
   ```
   `count` is how many the player picks — this app now stores that
   explicitly too, as `homebrew_class_features.choice_count` (set once per
   option row in a group, redundantly, same as `choice_group` itself; the
   exporter reads it off the first option in the group).
3. There is also a dedicated `optionalfeature` top-level array + a class's
   `optionalfeatureProgression` field for **reusable, cross-level** pick-pools
   (Fighting Styles, Eldritch Invocations, Battle Master Maneuvers, Fighter
   "exploits") — used when the same pool of options is available repeatedly
   across many levels rather than once. None of our current classes need
   this distinction yet, but it's the "correct" home for something like a
   Fighting Style list if we ever want it structured instead of embedded as
   a markdown table in a feature description.

### Inline tag markup seen in plain-string entries

5etools strings use `{@tag ...}` inline markup instead of markdown
(`**bold**`, links, etc. don't work in these strings). Common tags seen in
the sampled files: `{@i text}` (italics), `{@b text}` (bold, standard across
all 5etools content though not seen in the Cleric sample), `{@item name|source}`,
`{@spell name}` / `{@spell name|source}`, `{@dice 1d8}`, `{@damage 1d8}`,
`{@condition frightened}`, `{@filter label|page|params...}` (a dynamic
site-search link, e.g. the class-table column headers link to a filtered
spell list), `{@5etools text|page}` (site-internal link). **An exporter
writing OUR plain-text descriptions into this format should just emit plain
strings with no tags** — that's valid 5etools content, just without the
cross-linking; retrofitting real `{@item}`/`{@spell}` tags would require
matching our free-text against an actual compendium, which is out of scope.

## Foundry VTT overlay (`foundryClassFeature` / `foundrySubclassFeature`)

Separate top-level arrays, same identity keys as the base feature
(name/className/classSource/level, +subclass keys for the subclass
variant), but holding **only** Foundry-mechanical data — the base
`classFeature`/`subclassFeature` object still owns the name and `entries`
text. Fields seen: `system.uses.*` (limited-use resource tracking),
`activities[]` (attack/save/damage blocks — Foundry's structured action
system), `foundryImg` (icon path). This is an **overlay merge by matching
key**, not a replacement — think of it as "everything a `classFeature` has,
plus this extra mechanical envelope, when importing into Foundry
specifically."

## Mapping to this app's schema (as implemented in `classFormToFiveToolsJson`)

| This app | 5etools |
|---|---|
| `homebrew_classes.name` | `class[].name` |
| `homebrew_classes.hit_die` | `class[].hd.faces` (`hd.number` always `1`) |
| `homebrew_classes.primary_ability` | `class[].primaryAbility` (needs parsing our free-text into `{str:true}`-style objects) |
| `homebrew_classes.saving_throw_proficiencies` | `class[].proficiency` (already lowercase ability codes — direct copy) |
| `homebrew_classes.armor_proficiencies` / `weapon_proficiencies` / `tool_proficiencies` | `class[].startingProficiencies.{armor,weapons,tools}` (ours are free text, theirs want arrays — needs splitting) |
| `homebrew_classes.skill_choices_count` / `skill_choices_options` | `class[].startingProficiencies.skills[0].choose.{count,from}` |
| `homebrew_classes.starting_equipment` | `class[].startingEquipment.default` (ours is one string with newlines; split on line breaks into array entries) |
| `homebrew_classes.spellcasting_progression` / `spellcasting_ability` | `class[].casterProgression` / `spellcastingAbility` (`'none'` → omit both fields entirely) |
| `homebrew_classes.subclass_label` | `class[].subclassTitle` |
| `homebrew_class_features` (one row per level+feature) | one `classFeature` object per row + one reference string in `class[].classFeatures` |
| `homebrew_class_features.choice_group` / `choice_count` | split into per-option `classFeature` objects + an `options` block (with that `count`) on whichever same-level ungrouped feature's name contains the group name (e.g. group "Dark Arts" → feature "Dark Arts Continued"); if no name match exists, a placeholder intro feature named after the group is synthesized instead |
| *(implicit — a `subclass_levels` entry with no other feature at that level)* | a synthesized placeholder `classFeature` (empty `entries`) marked `gainSubclassFeature: true`, mirroring real files' "Domain Feature"-style placeholders |
| `homebrew_class_table_columns` + `_values` | one `classTableGroups` entry per column (or grouped under one shared title if we ever add that) |
| `homebrew_subclasses.name` | `subclass[].name` (+ a derived `shortName`) |
| `homebrew_subclass_features` | one `subclassFeature` object per row + a reference string in `subclass[].subclassFeatures` |

Not represented in our schema at all (fine to omit on export, 5etools
doesn't require them): `classSpells`/`subclassSpells`/`additionalSpells`
(class/subclass-specific spell lists), `multiclassing`, `classTableGroups`'
`rowsSpellProgression` variant (we have no spellcasting slot table concept),
`optionalfeature`/`optionalfeatureProgression` (reusable cross-level pick
pools), any Foundry `activities`/`system.uses` mechanical data (we have no
mechanical-resource modeling, just descriptive text).
