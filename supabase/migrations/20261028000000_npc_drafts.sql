-- NPC Forge drafts: statblocks built on the site and exported to Foundry VTT
-- as dnd5e actors (lib/foundryActorBuilder.js does the conversion).
--
-- `spec` is the editor's own NPC shape, stored whole - same reasoning as
-- item_maker_items.item: it belongs to the builder, and shredding it into
-- columns would mean a migration every time the editor learns a new field.
-- The Foundry actor JSON is never stored; it's rebuilt from the spec on every
-- export so builder fixes apply to old drafts too.
--
-- campaign_id is the scope the Foundry sync module (Phase 2) will pull by -
-- each Foundry world maps to one campaign, so a world only sees its own NPCs.
create table npc_drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled NPC',
  cr numeric not null default 1,
  campaign_id uuid references campaigns(id) on delete set null,
  spec jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index npc_drafts_campaign_id_idx on npc_drafts(campaign_id);

drop trigger if exists npc_drafts_set_updated_at on npc_drafts;
create trigger npc_drafts_set_updated_at
  before update on npc_drafts
  for each row execute function set_updated_at();

-- DM-only, like session_plans: statblocks are prep material, and players must
-- never be able to read them (the matching Foundry actors are GM-owned only).
alter table npc_drafts enable row level security;
create policy "dm manages npc drafts"
  on npc_drafts for all
  using (is_dm())
  with check (is_dm());
