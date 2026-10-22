# NPC Forge — Phase 2: Chrab Sync (as built)

Phase 1 (`docs/npc-forge.md`) builds NPC statblocks and downloads them as Foundry actors. Phase 2 replaces
"download → right-click → Import Data" with a queue.
1. On the site you press **Send to Foundry**.
2. The next time you load that Foundry world as GM, the **Chrab Sync** module tells you what's waiting.
3. **Apply** creates the actors, or updates them in place if they were sent before.
4. The result shows back on the site.

```
Site (DM)                           Supabase                                 Foundry (GM's browser only)
NPC editor ─ Send to Foundry ─▶  npc_drafts.queued_actor, status=queued
                                    sync_heartbeat / sync_pull_npcs   ◀───── Chrab Sync: "3 NPCs waiting"
                                    sync_report_npc                   ◀───── create/update actor (backup first)
List page ◀─ Waiting / In Foundry / Changed since sent / Failed
```

Out of scope: PC edits from the site (Phase 3), and compendium refs or Chris's Premades automation (Phase 4).
Syncing PCs back into `characters.raw_data` was added later; see [Character sync](#character-sync).

## Security model

- **The module holds no secrets.** Foundry module files are publicly downloadable and run only in the browser.
  `config.json` carries the Supabase URL and anon key, the same public values the site bundle already ships.
- **The module signs in as a dedicated `foundry-sync` user** with profile role `sync`. It is not your DM login and
  not your Foundry GM password.
- **The `sync` role has no table policies.** It can only call three `security definer` RPCs, and each one checks
  `is_sync() or is_dm()`:
  - `sync_heartbeat(world, title, campaign, version)`: upserts `foundry_worlds`.
  - `sync_pull_npcs(campaign)`: returns the queued drafts for one campaign.
  - `sync_report_npc(draft, queued_at, world, actor_uuid, error)`: sets the sync fields only. It only applies if
    `queued_at` still matches, so a re-send made while Foundry was applying an older copy stays queued.
  - Worst case if the session leaks: queued statblocks are readable, and drafts can be marked synced or failed.
- **The session stays in the GM's own browser.** The access and refresh tokens (never the password) are kept in
  `localStorage` when "remember me" is ticked, `sessionStorage` otherwise. They are never written to world settings,
  which every client can read. Sign out revokes the session.
- **Code runs only for GMs** (`game.user.isGM`). Players' browsers just register the settings.
- **NPCs stay GM-only.** After every create or update the module resets ownership to `{ default: NONE }`, keeping
  only GM entries.

## What was built

| Path | What |
| --- | --- |
| `supabase/migrations/20261030000000_foundry_sync.sql` | Adds the `sync` role and `is_sync()`. Adds queue columns on `npc_drafts`: `sync_status`, `queued_actor`, `queued_at`, `synced_at`, `sync_error`, `foundry_actor_uuid`, `foundry_world_id`, and `spec_updated_at` (moved by a trigger only when `spec` changes). Adds the `foundry_worlds` table (DM-only) and the three RPCs. |
| `src/components/dm/npc/NpcEditor.jsx` | **Send to Foundry** / **Re-send** button. It requires a campaign and builds the actor at send time into `queued_actor`. |
| `src/pages/dm/DMNpcForgePage.jsx` | Status badge per draft, a Send / Re-send button, and a **Linked Foundry worlds** panel (title, campaign, last seen, module version) with the manifest URL. |
| `src/lib/foundryActorBuilder.js` | The draft flag is now `flags['chrab-sync'].npcDraftId`, the module's id. Foundry's `getFlag` only accepts package scopes. A test ties this to `module.json`. |
| `foundry/chrab-sync/` | The Foundry module (below). |
| `.github/workflows/deploy.yml` | Packages the module into the site: `/foundry/chrab-sync/module.json` + `/foundry/chrab-sync.zip`, with `config.json` generated from the existing secrets and version `0.1.<run number>`. |
| `.github/workflows/ci.yml` | Every PR runs `npm test`, checks the module JSON and script syntax, and runs `npm run build`. |

### The module (`foundry/chrab-sync/`)

| File | What |
| --- | --- |
| `module.json` | id `chrab-sync`, Foundry ≥ 14 (verified 14.368), dnd5e ≥ 5.3.0. The manifest and download URLs point at the site. |
| `scripts/main.mjs` | Settings: the world's campaign (hidden), NPC folder name, "check on login", and the **account & campaign** menu. Ready hook: notification when NPCs are waiting. Adds the **Chrab Sync (n)** button to the Actors sidebar. |
| `scripts/supabase.mjs` | Plain `fetch`: sign in, refresh, sign out, `rpc()`, `listCampaigns()`. No bundled library. |
| `scripts/queue.mjs` | `checkQueue()`: heartbeat + pull for this world's campaign. |
| `scripts/apply.mjs` | Finds an existing actor by draft flag (also reading the Phase 1 `chrab-corner` flag). **Update:** back up to the "Chrab Sync Backups" world compendium, then `importFromJSON`, the same as manual Import Data. **New:** create in the NPC folder. Then lock ownership. |
| `scripts/apps.mjs` | Two ApplicationV2 windows. **SyncApp:** the queue, checkboxes, Apply, and a per-row result. **ConfigApp:** sign in/out and the campaign picker. |
| `config.example.json` | Shape of `config.json`. The real one is gitignored, because deploy generates it. |

**Known trade-off:** an update replaces anything changed inside Foundry since the last sync. Edit NPCs on the site;
the backups cover mistakes.

## Setup after this PR merges

1. **Wait for the deploy to finish** (Actions → "Deploy to GitHub Pages").
   Check that `https://compendium.chrab.us/foundry/chrab-sync/module.json` loads.
2. **Database:** run `npx supabase db push` on a machine with the Supabase CLI.
   - If it fails on `profiles_role_check`, look up the role constraint's real name in the Table Editor and adjust
     the migration.
3. **Sync account:**
   1. Supabase dashboard → **Authentication → Add user**. Use something like `foundry-sync@<your domain>` with a long
      generated password, and tick auto-confirm.
   2. **Table Editor → profiles** → that user → set `role` to `sync`. Signup creates it as `player`.
   3. Save the password in your password manager.
4. **Foundry** (on the setup screen, using your admin password):
   1. **Add-on Modules → Install Module** → paste `https://compendium.chrab.us/foundry/chrab-sync/module.json` into
      *Manifest URL* → Install.
   2. Launch the world → **Manage Modules** → enable **Chrab Sync**.
   3. **Settings → Chrab Sync account & campaign → Open** → sign in with the sync account → pick the campaign →
      Save.
5. **Updates:** after later deploys, use **Add-on Modules → Check for updates** in Foundry.

## Verification

**Permissions:** use the sync account's token from the browser devtools, or `curl` with it.
- [ ] Direct `select` on `npc_drafts`, `entries`, `characters` and `profiles` returns nothing.
- [ ] `sync_pull_npcs` and `sync_heartbeat` work.
- [ ] `sync_report_npc` only changes the sync fields.
- [ ] Logged out (anon key only), all three RPCs are refused.
- [ ] As a player account, all three RPCs raise "not allowed".

**Site:**
- [ ] Send to Foundry without a campaign shows the "pick a campaign" error.
- [ ] With a campaign, the badge reads **Waiting for Foundry**.
- [ ] After a successful apply it reads **In Foundry**. Editing the statblock afterwards → **Changed since sent**.
      Re-send → **Waiting** again.
- [ ] The Linked Foundry worlds panel shows the world after the GM loads it.

**Foundry, in a test world first:**
- [ ] Sign in, then reload the page: still signed in. Sign out clears it. With "remember me" off, closing the tab
      forgets it.
- [ ] As a player: no Chrab Sync button, no notification, and no `chrab-sync` network calls in devtools.
- [ ] A queued NPC → Apply → created in the "Chrab Corner NPCs" folder. A player can't open it. The site shows
      **In Foundry**.
- [ ] Re-send after an edit → Apply → the same actor updates in place (same uuid, placed tokens still fine), and a
      dated copy appears in "Chrab Sync Backups".
- [ ] Two worlds mapped to different campaigns each only see their own NPCs.
- [ ] A failing NPC shows its error in the window and as **Sync failed** on the site, without stopping the rest of
      the batch.

## Character sync

The module also does what the party-export macro and manual import did, for characters the site already has.

- **When:** when a signed-in GM loads the world, it pushes every player character (`type: character`, has a player
  owner) whose sheet changed since that browser last pushed it. While playing, a changed character is pushed 30 s
  after its first change. You can turn it off with the module setting *Sync player characters to the Compendium*.
  **Sync characters now** in the Chrab Sync window forces a full push.
- **Matching:** by Foundry actor id (`characters.foundry_id`) only. A sheet only overwrites `raw_data` and
  `currency`; name, player, campaign and skill trees stay. Actors with no matching row are listed as "not on the
  site yet". Import those once with the site's importer (which can also link an old row), and they sync from then on.
- **Shop trades are never settled automatically.** A push can't know whether a trade was applied in Foundry yet.
  The Chrab Sync window lists unsettled trades per character. Apply them to the sheet, then click
  **Applied in Foundry — sync & settle**. That pushes the sheet and settles exactly the trades shown.
  - Between applying a trade and settling it, an automatic push can briefly double-count it in the site balance.
- **RPCs** (`supabase/migrations/20261031000000_sync_characters.sql`): `sync_push_character(actor, settle_trade_ids)`
  and `sync_pending_trades()`, with the same `is_sync() or is_dm()` gate. This widens the leaked-session worst case:
  existing characters' sheets and gold can be overwritten (never created, deleted or reassigned), and pending trades
  read or settled.
- **Setup:** `npx supabase db push`, then redeploy so Foundry picks up the new module version.

## Unverified assumptions (check on the first real run)

These were written against Foundry's v13+ API, without a running v14 server to test against:
- **Windows:** `foundry.applications.api.ApplicationV2` with `_renderHTML` / `_replaceHTML` and `actions`.
  `registerMenu` accepting an ApplicationV2 class.
- **Sidebar hook:** `renderActorDirectory` passing an `HTMLElement` with a `.header-actions` container. The code
  falls back to `.directory-header` and to jQuery.
- **Compendium creation:** `foundry.documents.collections.CompendiumCollection.createCompendium`, with a fallback to
  the global.
- **Ownership:** `actor.update({ ownership }, { recursive: false })` replacing the ownership object outright.
- **Network:** CORS from the Foundry origin to Supabase. Supabase normally allows any origin for these endpoints.

If any of these fail, the browser console (F12) shows `chrab-sync |` errors. Send those over.
