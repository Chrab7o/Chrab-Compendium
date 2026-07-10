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
- **Player** — logs in at `/login`, lands on `/notes` to keep private notes only they
  and the DM can read.

Every Supabase Auth user gets a row in the `profiles` table (`role` = `dm` or `player`).
New accounts default to `player`; to make an account a DM, open **Table Editor → profiles**
in the Supabase dashboard and change that row's `role` to `dm`.

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
   yourself (DM) and one per player. Leave public sign-ups disabled.
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
```
