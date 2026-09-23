# Tag-group overhaul

Status: implemented; migration not yet run.

## Why

Folders were built as the primary way to organize and find entries. In practice:

- Search turned out to be the way entries actually get found.
- Creating an entry forces a detour through the category/folder tree, which is
  the single biggest friction point in the DM flow.
- The Obsidian-over-Google-Drive sync that folders were partly shaped around
  is not in use.

Once tags carry grouping, visibility, and campaign scoping, folders retain no
unique capability — they are two systems that have to agree, for nothing. So
they go, along with everything built to work around their limitations.

`entry_placements` is the clearest case: it exists solely because an entry can
live in exactly one folder. An entry carrying three tags appears under all
three natively, so the table, its unique index, its RLS policies,
`mergePlacements()`, and `PlacementManager` all evaporate.

## Target model

### `tag_groups` (new)

The pseudo-folders. A group is a facet: Type, Collection, Region, Faction,
Status, Campaign.

| column | notes |
|---|---|
| `value` | stable slug |
| `label` | display name |
| `sort_order` | order of filter rows in search |
| `exclusive` | single-select (Type) vs multi-select (Faction) |
| `required` | entry must carry one tag from this group (Type) |
| `color` | group chip color |
| `visibility` | `public` \| `dm` — hides the whole group and everything tagged from it |

### `tags` (extended)

Gains `group_id`, `color`, `description`, `visibility`. `entries.tags` stays a
plain `text[]` of tag values — grouping is a property of the tag, so it comes
for free with no join table.

### Search semantics

**OR within a group, AND across groups.** This is what makes a group behave
like a folder: `Type: NPC` + `Region: Ashfall` reads exactly like a path, but
the same entry also sits under `Faction: Ashen Hand` without being duplicated
or re-filed.

## Decisions taken

- **Categories collapse into an exclusive tag group.** `categories` becomes the
  `type` group, `exclusive` + `required`. The table itself goes.
- **Flat groups, flat tags.** No `parent_tag_id`, no recursive tag queries.
- **Campaign becomes a tag group** *in addition to* `entries.campaign_id`. The
  column stays authoritative for existing machinery (session planner,
  characters, maps, worlds); the group adds secondary membership so an entry
  can appear under more than one campaign.
- **Tag-driven visibility.** `tags.visibility` / `tag_groups.visibility` replace
  `is_category_public()` and `is_folder_public()` with `is_tags_public(text[])`,
  preserving "one toggle hides many".
- **Bulk edit over inheritance** — the answer to "change 40 entries at once" is
  a bulk action on search results.
- **Manual ordering is dropped.** `entries.sort_order` and drag-reordering go;
  results sort by title or `updated_at`. A sequence that matters goes in the
  entry content or a numeric title prefix.
- **One migration, no interim.** Convert and demolish in a single pass rather
  than running both systems side by side.

## Migration order

Every step is lossless before anything is dropped.

1. Create `tag_groups`; add `group_id`, `color`, `description`, `visibility` to
   `tags`.
2. Seed groups: `type` (exclusive + required, from `categories` rows, carrying
   their `visibility`), `role` (the pre-existing location/person/session-note
   tags — deliberately *not* folded into Type, since an entry is commonly
   category `lore` *and* tagged `person`, and an exclusive group would make
   picking one clear the other), `campaign` (from `campaigns`), `collection`
   (one tag per existing folder), plus empty `region` and `faction`.
3. **Stamp entries before folders die** — for each entry, write back the values
   it was inheriting: effective visibility (`dm` if any ancestor folder is),
   effective `campaign_id` (nearest ancestor), and effective tags (own tags +
   every ancestor folder's tags + its category + its folder's collection tag).
4. **Fold `entry_placements` into tags** — a placement into folder X becomes
   folder X's collection tag on that entry.
5. `map_regions.folder_id` → `tag_query text[]`, backfilled with the folder's
   collection tag. Because collection tags are stamped transitively down the
   tree, one tag matches the whole former subtree.
6. `region_folder_links` → `region_tag_links` for per-timeline overrides.
7. Add `is_tags_public(text[])` — false if any tag in the array, or its group,
   is `dm`; fails open on unknown tags, as `is_category_public()` did.
8. Swap the `entries` select policy to `is_tags_public(tags)`, and restrict
   the `tags` select policy too — a DM-only tag's *name* is a spoiler on its
   own, and every search filter row is built straight from that table.
9. Drop: `entry_placements`, `region_folder_links`, `folders`,
   `entries.folder_id`, `entries.sort_order`, `entries.category`, `categories`,
   `is_folder_public()`, `is_category_public()`.

## Application changes

- `lib/folders.js` → `lib/tags.js`. `effectiveEntryTags`/`mergePlacements`/
  `folderPath`/`flattenFolders`/`descendantFolderIds` all disappear; what
  survives is campaign scoping and tag-group query helpers.
- `CategoryContext` → served from the `type` tag group.
- **Creation**: `NewEntryFab` opens the editor in one tap with no category
  prompt. The editor drops the Folder select entirely and renders tags grouped
  — exclusive groups as chip radios, multi groups as chip toggles — with inline
  "＋ create «Foo» in Region" so adding a tag never means leaving the page.
- **Search**: one filter row per group, OR-within / AND-across, plus bulk edit
  on selected results (add/remove tag, set visibility, set campaign).
- `TagView` (Locations/People/Session Notes) becomes a thin preset over the
  same query.
- **Deleted**: `CategorySidebar`, `CategoryBrowser`, `PlacementManager`,
  `CategoryConsolidator`, `CategoryManager`, `CategoryContext`, `lib/categories.js`,
  `lib/folders.js`, the organize tree, `useRegionFolderLinks`, and the unused
  `useEntries` hook. The scheduled Obsidian-over-Drive sync goes too
  (`scripts/obsidian-*.mjs`, its GitHub workflow, `obsidian_synced_images`) —
  it is not in use and the migration drops the schema it read. The in-app
  vault importer stays, remapping vault folders to Type + Collection tags.
- `TagManager` grows group management; `MapRegionEditor` targets a tag query
  instead of a folder.

## Open risks

- `is_tags_public()` runs per row on `entries` select. If it shows up in query
  time, the fix is a cached `entry_is_public` boolean maintained by trigger.
- Campaign mirror tags and `campaign_id` can drift if a DM edits the tag
  without the column. A trigger covers `campaigns` renames/deletes, not that.
- Step 3 is the irreversible one: after it, inherited values exist only as
  stamped columns. Back up `entries`, `folders`, and `entry_placements` before
  running it.
