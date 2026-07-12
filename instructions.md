# Chrab Corner

A TTRPG campaign wiki: world lore, campaign notes, homebrew, maps, and player notes,
backed by Supabase and deployed as a static site on GitHub Pages.

Nav tabs (centered), with a campaign picker top-right that scopes every tab to whichever
campaign you're viewing (or "All campaigns" for everything general/public):

- **Home** (`/`) — the landing page and main browser: a hero banner plus a sidebar tree
  (Lore, NPC, Location, etc., each expandable into arbitrarily nested folders) next to a
  content pane showing whatever's selected. Scoped to the selected campaign (its entries
  + general world lore), or everything if no campaign is selected.
- **Maps** — pannable/zoomable image maps with clickable markers that jump to an entry,
  also scoped by the campaign picker.
- **Locations / People / Session Notes** — tag-based views, not folder browsing: any entry
  tagged `location`, `person`, or `session-note` (case-insensitive) shows up on the matching
  page, scoped by the campaign picker same as everywhere else. An entry can carry more than
  one of these tags and show up on multiple pages; it doesn't need to live in any particular
  folder to qualify.
- **My Notes** (players, login required) — private notes, visible only to that player
  and to the DM.
- **DM Dashboard** (`/dm`, DM login required) — sees and edits everything, including
  entries/markers marked "DM only" and every player's notes.

Visibility is enforced server-side with Postgres Row Level Security, not just hidden in
the UI — anonymous visitors and player accounts physically cannot fetch rows above their
access level, even by hitting the API directly.

## Roles

There are two account types, both created manually by you (no public sign-up):

- **DM** — full access to everything, via the DM Dashboard.
- **Player** — logs in at `/login`, lands on `/account` (character sheet, private notes,
  and password change all one click away).

Every Supabase Auth user gets a row in the `profiles` table (`role` = `dm` or `player`).
New accounts default to `player`; to make an account a DM, open **Table Editor → profiles**
in the Supabase dashboard and change that row's `role` to `dm`.

Supabase Auth is email-based. Players don't need a *real* email — a made-up address like
`frodo@players.chrab.us` works fine as their login, since Supabase never actually sends
anything there. Whatever you put in the Email field when creating their account (below) is
exactly what they type to log in.

## One-time setup

### 1. Supabase

The database schema lives in [`supabase/migrations/`](supabase/migrations) and is pushed
with the Supabase CLI (already a project dependency — no global install needed, invoke it
with `npx supabase ...`).

1. Log in once (opens a browser to authorize the CLI):
   ```
   npx supabase login
   ```
2. Link this repo to your Supabase project. Find your project ref in the Supabase
   dashboard URL (`https://supabase.com/dashboard/project/<ref>`) or under
   **Project Settings → General**:
   ```
   npx supabase link --project-ref <your-project-ref>
   ```
3. Push the schema:
   ```
   npx supabase db push
   ```
   This applies every file in `supabase/migrations/` in order — campaigns/entries, maps,
   roles + player notes, and entry extras (linked DM notes + image uploads). Any time you
   add a new migration file, re-run `db push` to apply it.

   The roles migration (`20260105000000_roles_and_notes.sql`) marks whichever account(s)
   already exist at push time as `dm`. If you already created player accounts *before*
   running it, double-check their `role` in **Table Editor → profiles** afterward.
4. Go to **Authentication → Users** in the dashboard to create accounts — one for
   yourself (DM) and one per player (a made-up email is fine, see above). Leave public
   sign-ups disabled.
5. Go to **Project Settings → API** and copy the **Project URL** and **anon public** key.

(If you'd rather not use the CLI, you can instead paste each migration file's contents
into the dashboard's **SQL Editor**, in filename order — same effect, just not tracked as
a migration going forward.)

### 2. Local dev

```
npm install
cp .env.example .env   # fill in your Supabase URL + anon key
npm run dev
```

### 3. GitHub Pages deploy

1. In the repo, go to **Settings → Pages** and set Source to **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions** and add two repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys
   automatically. The site is served from a custom domain at
   [compendium.chrab.us](https://compendium.chrab.us/) — `public/CNAME` records that domain so
   it's included in every deploy. Vite's `base` is set to `/` in `vite.config.js` to match
   (would need to change back to `/Chrab-Corner/` if you ever moved off the custom domain back
   to the plain `github.io/Chrab-Corner/` URL).

The anon key is safe to ship in the client bundle — it's meant to be public. Row Level
Security in `supabase/migrations/` is what actually controls who can read or write what.

## Adding content

Log in at `/login` with your DM account, then use the DM Dashboard to add campaigns and
entries. Each entry has:

- **Category** — lore, NPC, location, session note, homebrew, or item.
- **Visibility** — `public` (everyone) or `dm` (only you, once logged in).
- **Campaign** — optional; leave unset for general/world-wide lore that shows up
  everywhere, or assign it to scope the entry to one campaign's view.
- **Attach as DM notes on entry** (optional) — link this entry as a secret addendum to
  another entry. When you (the DM) view that parent entry, a "DM Notes" section shows
  every entry linked to it. This keeps secrets in their own row (so RLS actually hides
  them from anonymous API responses) rather than hiding text inside a public entry's
  content, which would still leak in the raw API response.
- **Folder** — organizes the entry within its category's folder tree (see below).

The content editor supports Markdown, including GFM tables. Use the toolbar above the
textarea to insert an image (uploads to the `entry-images` storage bucket and drops in a
`![]()` link) or a starter table skeleton, and toggle a live preview pane.

### Organizing entries into folders

Folders are purely for browsing/navigation — they are **not** a visibility boundary.
Whether something is public or DM-only is still controlled entirely by that entry's own
`visibility`, exactly as before; a folder can freely mix public and DM-only entries.
Anonymous/player visitors just won't see a folder at all if none of its contents
(recursively) are visible to them.

In the Home sidebar, logged in as DM you get, per folder row (hover to reveal): **+**
(new subfolder), **✎** (rename), **⇄** (move to a different parent), **✕** (delete —
contents move up to the parent folder, nothing is lost). Each category root also has its
own **+** for a top-level folder. Drag the ⠿ handle to reorder folders among their
siblings, or entries within the currently selected folder (shown in the content pane on
the right). **+ New entry here** in the content pane creates an entry inside whichever
folder is currently selected.
- To move an *entry* into a different folder, edit it and change its **Folder** field.

### Maps

Also from the DM Dashboard: upload an image to create a map (optionally scoped to a
campaign), then click anywhere on it to drop a marker. Drag an existing marker to
reposition it. Each marker has a label, a visibility (`public`/`dm`), and can optionally
link to one of your entries — clicking a linked marker on the public site jumps straight
to that entry's page. Map images are stored in the public `maps` storage bucket.

### Player notes

Players log in at `/login` and land on `/notes`, where they can create/edit/delete their
own private notes (optionally scoped to a campaign). You can read every player's notes
(read-only) from the DM Dashboard's "Player Notes" panel.

### Importing character sheets (Foundry VTT) and notes (Obsidian)

From **DM Dashboard → Import** (`/dm/import`):

- **Foundry**: upload one or more Actor export `.json` files. Each becomes a row in the
  `characters` table (the full raw export is kept, so nothing is lost), assignable to a
  player and campaign right there in the import list. The exported JSON is Foundry's
  *source* data, not its computed sheet — AC and max HP aren't stored by Foundry, so the
  viewer (`/character/:id`) estimates them from equipped gear / class hit dice and labels
  them as estimates. Known gap: feat/racial HP bonuses (e.g. Tough) aren't counted, since
  those aren't reliably derivable from the export alone.
- **Obsidian**: pick your vault folder (grabs notes and images together). You map each
  top-level folder to an entry category, pick a default visibility/campaign, then import.
  `[[wikilinks]]` between notes and `![[embedded images]]` are resolved in a second pass
  once every note has a real entry ID — unresolved links are reported after import so you
  can fix them by hand. Callouts and Obsidian comments aren't converted; they come through
  as plain text.

Players see their own character at **My Character** (`/character`), scoped to whichever
campaign is selected in the nav picker — reassign a character's campaign/player anytime
from the DM Dashboard's "Characters" panel.

### Skill trees

System-agnostic — a tree's nodes just have a name, description, and point cost, so it works
for any game, not just D&D. Build one from **DM Dashboard → Skill Trees** (`/dm/skill-trees`):
create a tree (optionally scoped to a campaign), then add nodes — each node except a root
needs a parent, and unlocking it later requires that parent to already be unlocked first
(single-parent nesting for display, same shape as folder nesting elsewhere in the app).

A node can also have **additional prerequisites** beyond its parent (e.g. two branches that
converge on one unlock) — pick them in the node's edit form, plus whether it needs **all** of
its prerequisites unlocked (the default) or just **any one** of them.

Grant a character points to spend from the DM Dashboard's **Characters** panel — a number
input appears per applicable tree once one exists for that character's campaign (or a
general one). Players spend those points themselves from **Skill Tree** in their own nav
(next to Character Sheet/My Notes/Account) — unlocking is enforced server-side (a
`security definer` Postgres function checks ownership, that its prerequisites are satisfied,
and that enough points remain) so a player can't unlock something out of order or overspend
by tampering with the client. There's no "respec" in v1 — delete a specific character's
unlock row directly in the Supabase dashboard's Table Editor (`character_skill_unlocks`) if a
mistake needs correcting.

**Restricting a tree to specific players**: optional, on top of its campaign scoping — check
players in "Restrict to specific players" when creating/editing a tree (DM Dashboard → Skill
Trees). Leave it empty and everyone in that campaign sees it (the previous, default
behavior); pick specific characters and it's hidden from everyone else — enforced by RLS, not
just hidden in the UI, same as everything else here.

**Viewing/acting as a player**: since the DM's own account has no character, the
player-facing `/skills`, `/notes`, etc. pages will always say "no character found" for a DM
session on their own — that's expected, not a bug. To actually check or interact with a
specific player's stuff without their login, click **View As** next to a character in
**DM Dashboard → Characters** (only available once that character has a player assigned). A
persistent "Viewing as *Name*" banner appears — every player-facing page (Character Sheet, My
Notes, Skill Tree, Account) now acts on that character/player instead of the DM's own
session, including writes (unlocking nodes, adding notes). Click **Exit** in the banner to
return to normal. Password changes are hidden while viewing as someone else, since that would
change the DM's own login, not theirs. This is a client-side convenience only — the real
access control is still enforced server-side regardless of what's being "viewed as".

**Visual diagram**: click **Show diagram** (in the node editor or either Skill Tree view) for
an auto-laid-out picture of the tree instead of the outline list — nodes position themselves
based on their connections (via `@dagrejs/dagre`), no manual arranging. It's not
draggable/editable, just a picture; the outline is still what you use to actually build or
unlock things.

**Export/Import**: from the node editor, **Export JSON** downloads a tree's full structure
(portable — uses local ids, not database ids, so it never collides with anything).
**Import JSON** always creates a **new** tree from an uploaded file rather than merging into
an existing one, so you can freely share/reuse tree designs across campaigns or back them up.

**Building a tree in draw.io instead**: `scripts/drawio-to-skilltree.mjs` converts an
exported draw.io diagram straight into that same import JSON. In draw.io: **File → Export
as → XML...**, with **Compressed unchecked** (the compressed default needs a decompression
step this script doesn't do). Conventions it expects:
- A node's label is either plain text, or stacked lines (each its own paragraph/line in the
  shape) — the first line is the name, the last line is the point cost *if* it looks like
  `123xp` (case-insensitive), and everything between is the description. No recognizable
  cost line just means cost 0.
- Arrows point **from a prerequisite to the node it unlocks**. A shape with no incoming
  arrow becomes a root (more than one is fine). A shape with no arrows touching it at all
  (a title box, a stray label) is treated as decoration and skipped.
- A node can have more than one incoming arrow — the first one found becomes its structural
  parent, the rest become additional prerequisites. Since arrows can't express "any one is
  enough", multi-prerequisite nodes always default to requiring **all** of them; the script
  lists which ones ended up with multiple arrows so you can flip specific ones to "any one"
  afterward if that's what you meant (e.g. two branches that either one unlocks a node).

Run it with `npm run convert:drawio -- "My Tree.drawio.xml"`, then use the DM Dashboard's
**Import JSON** with the `.skilltree.json` file it writes.

### Auto-syncing an Obsidian vault (advanced)

Instead of manually re-running the Obsidian importer above every time your notes change,
`scripts/obsidian-sync.mjs` does it on a schedule via GitHub Actions — reading a Google
Drive mirror of your vault and upserting into the same tables. **One-directional for
content**: Obsidian is the source of truth for title/text/tags/folder placement, so editing
those directly on the site gets overwritten by the next sync — and **deleting a note or
folder in Obsidian deletes it on the site too**, on the next sync run after it disappears.
This is irreversible (no undo/trash), so two circuit breakers refuse to delete anything if a
run looks broken rather than intentional: finding zero notes at all (almost always a Drive
permissions/config problem, not an empty vault), or more than half of everything previously
synced disappearing in one run. Either case aborts the deletion pass and logs why, without
touching anything. Re-runs are otherwise safe: Google Drive's permanent file/folder ids are
stored (`entries.obsidian_file_id`, `folders.obsidian_folder_id`) so a sync updates the same
rows instead of duplicating them, and renaming/moving a note or folder in Drive updates in
place too.

**Visibility and campaign assignment are the exception** — those are only set when a
folder/entry is first created (from the config's defaults/overrides below), never touched
again afterward. Once something exists on the site, whether it's DM-only and which campaign
it belongs to is managed entirely through the DM Dashboard's existing folder/entry tools, the
same as anything else — the sync won't silently reset a flag you set there.

One-time setup:

1. Keep your vault (or a copy structured to mirror the compendium's categories) synced
   into a Google Drive folder — e.g. via the Google Drive desktop app pointed at that
   folder. Note the folder's id from its URL
   (`https://drive.google.com/drive/folders/<id>`).
2. In [Google Cloud Console](https://console.cloud.google.com/), create/reuse a project,
   enable the **Google Drive API**, then create a **service account** and download its
   JSON key. Share the Drive folder from step 1 with that service account's email
   (`client_email` in the JSON key), as a Viewer.
3. Create a dedicated Supabase account for the sync job — same steps as any account
   (**Authentication → Users**), e.g. email `obsidian-sync@players.chrab.us`, and set its
   `role` to `dm` in **Table Editor → profiles**. Using a separate account (not your own
   DM login) means it can be revoked/rotated without touching your real login.
4. In the repo's **Settings → Secrets and variables → Actions**, add:
   - `SYNC_DM_EMAIL` / `SYNC_DM_PASSWORD` — the account from step 3
   - `GDRIVE_SERVICE_ACCOUNT_KEY` — the full JSON key from step 2, as one value
   - (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are already there from the Pages
     deploy setup)
5. Edit `scripts/obsidian-sync.config.json`: set `rootFolderId` to the id from step 1, and
   map each top-level vault folder name to a category `value` (see **DM Dashboard →
   Categories** for the exact values) — a top-level folder not listed here is skipped, not
   guessed at. Optionally override `visibility`/`campaignId` per folder. Commit it.

`.github/workflows/obsidian-sync.yml` runs every 30 minutes and can also be triggered
on-demand from the **Actions** tab (`Sync Obsidian Vault` → **Run workflow**). Check a
run's log for a summary (created/updated/skipped/unresolved-link counts) or errors.
You can also dry-run it locally with `npm run sync:obsidian` if you export the same five
env vars in your shell first.

## Project structure

```
supabase/migrations/          Database schema + RLS policies, applied via `npx supabase db push`
src/lib/supabaseClient.js     Supabase client, reads VITE_SUPABASE_* env vars
src/contexts/AuthContext      Tracks login session + role (dm/player)
src/contexts/CampaignContext  Global "which campaign am I viewing" picker state
src/hooks/useEntries.js       Fetches entries with campaign/category filters
src/pages/                    Route-level views (Home, Maps, Notes, DM Dashboard, etc.)
src/components/MapViewer.jsx  Shared Leaflet (CRS.Simple) map + marker renderer
src/components/dm/            DM-only campaign/entry/map/marker/notes CRUD + viewers
.github/workflows/deploy.yml  Build + deploy to GitHub Pages on push to main
scripts/obsidian-sync.mjs     Scheduled Obsidian (via Google Drive) -> Supabase sync
.github/workflows/obsidian-sync.yml  Runs the sync above every 30 min + on demand
```
