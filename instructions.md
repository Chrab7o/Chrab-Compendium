# Chrab Corner

A TTRPG campaign wiki: world lore, campaign notes, and homebrew, backed by Supabase and
deployed as a static site on GitHub Pages.

Three views:

- **General** — everything public, across all campaigns.
- **Campaign** — pick a campaign, see public entries scoped to it plus general lore.
- **DM Dashboard** (`/dm`, login required) — sees and edits everything, including
  entries marked "DM only".

Visibility is enforced server-side with Postgres Row Level Security, not just hidden in
the UI — anonymous visitors physically cannot fetch `DM only` rows.

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
   This creates the `campaigns` and `entries` tables and their RLS policies. Any time you
   change `supabase/migrations/`, add a new migration file and re-run `db push` to apply it.
4. Go to **Authentication → Users** in the dashboard and manually add one user (your email
   + password). This is your DM login. Leave public sign-ups disabled — the site never
   needs more than one account.
5. Go to **Project Settings → API** and copy the **Project URL** and **anon public** key.

(If you'd rather not use the CLI, you can instead paste the contents of
`supabase/migrations/20260101000000_initial_schema.sql` into the dashboard's **SQL Editor**
and run it there — same effect, just not tracked as a migration going forward.)

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
   automatically. Your site will be live at `https://<your-username>.github.io/Chrab-Corner/`.

The anon key is safe to ship in the client bundle — it's meant to be public. Row Level
Security in `supabase/migrations/` is what actually controls who can read or write what.

## Adding content

Log in at `/dm/login` with the Supabase Auth user you created, then use the DM Dashboard
to add campaigns and entries. Each entry has:

- **Category** — lore, NPC, location, session note, homebrew, or item.
- **Visibility** — `public` (everyone) or `dm` (only you, once logged in).
- **Campaign** — optional; leave unset for general/world-wide lore that shows up
  everywhere, or assign it to scope the entry to one campaign's view.

Content is Markdown.

## Project structure

```
supabase/migrations/       Database schema + RLS policies, applied via `npx supabase db push`
src/lib/supabaseClient.js  Supabase client, reads VITE_SUPABASE_* env vars
src/contexts/AuthContext   Tracks DM login session
src/hooks/useEntries.js    Fetches entries with campaign/category filters
src/pages/                 Route-level views (General, Campaign, DM Dashboard, etc.)
src/components/dm/         DM-only campaign/entry CRUD forms
.github/workflows/deploy.yml  Build + deploy to GitHub Pages on push to main
```
