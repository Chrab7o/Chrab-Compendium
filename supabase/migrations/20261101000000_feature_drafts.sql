-- Feature Forge: single Foundry items (class features, feats, spells) built on
-- the site and sent to a world's Items directory through Chrab Sync, on their
-- own rather than inside an NPC. See docs/feature-forge.md.
--
-- Same shape and rules as npc_drafts + 20261030000000_foundry_sync.sql:
--   * spec is the editor's own shape (lib/foundryFeatures.js), stored whole.
--   * queued_item is the Foundry item JSON built at send time, so Foundry gets
--     exactly what the editor previewed.
--   * DM-only. Feature scripts are JavaScript that runs in players' browsers
--     once the item is on a character, so only DMs may write them.
--   * The sync role gets no table policies, only the two RPCs below. Worst
--     case if its session leaked: queued features are readable and can be
--     marked synced or failed.
create table if not exists feature_drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled feature',
  kind text not null default 'feat' check (kind in ('feat', 'spell')),
  campaign_id uuid references campaigns(id) on delete set null,
  spec jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_status text not null default 'draft' check (sync_status in ('draft', 'queued', 'synced', 'failed')),
  queued_item jsonb,
  queued_at timestamptz,
  synced_at timestamptz,
  sync_error text,
  foundry_item_uuid text,
  foundry_world_id text,
  spec_updated_at timestamptz not null default now()
);
create index if not exists feature_drafts_campaign_id_idx on feature_drafts(campaign_id);

drop trigger if exists feature_drafts_set_updated_at on feature_drafts;
create trigger feature_drafts_set_updated_at
  before update on feature_drafts
  for each row execute function set_updated_at();

-- Same stamps as npc_drafts_touch_spec (one clock for "changed since sent").
create or replace function public.feature_drafts_touch_spec()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.spec is distinct from old.spec then
    new.spec_updated_at = now();
  end if;
  if new.sync_status = 'queued' and (
    tg_op = 'INSERT'
    or old.sync_status is distinct from 'queued'
    or new.queued_item is distinct from old.queued_item
  ) then
    new.queued_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists feature_drafts_touch_spec on feature_drafts;
create trigger feature_drafts_touch_spec
  before insert or update on feature_drafts
  for each row execute function feature_drafts_touch_spec();

alter table feature_drafts enable row level security;
drop policy if exists "dm manages feature drafts" on feature_drafts;
create policy "dm manages feature drafts"
  on feature_drafts for all
  using (is_dm())
  with check (is_dm());

create or replace function public.sync_pull_features(p_campaign_id uuid)
returns table (
  id uuid,
  name text,
  kind text,
  queued_item jsonb,
  queued_at timestamptz,
  foundry_item_uuid text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (is_sync() or is_dm()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select d.id, d.name, d.kind, d.queued_item, d.queued_at, d.foundry_item_uuid
    from feature_drafts d
    where d.campaign_id = p_campaign_id
      and d.sync_status = 'queued'
      and d.queued_item is not null
    order by d.queued_at;
end;
$$;

-- As sync_report_npc: ignored unless p_queued_at is still the queued copy.
create or replace function public.sync_report_feature(
  p_draft_id uuid,
  p_queued_at timestamptz,
  p_world_id text,
  p_item_uuid text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer;
begin
  if not (is_sync() or is_dm()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update feature_drafts
    set sync_status = case when p_error is null then 'synced' else 'failed' end,
        synced_at = case when p_error is null then now() else synced_at end,
        sync_error = p_error,
        foundry_item_uuid = coalesce(p_item_uuid, foundry_item_uuid),
        foundry_world_id = coalesce(p_world_id, foundry_world_id)
    where id = p_draft_id
      and sync_status = 'queued'
      and queued_at = p_queued_at;
  get diagnostics touched = row_count;
  return touched > 0;
end;
$$;

revoke execute on function public.sync_pull_features(uuid) from public, anon;
revoke execute on function public.sync_report_feature(uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.sync_pull_features(uuid) to authenticated;
grant execute on function public.sync_report_feature(uuid, timestamptz, text, text, text) to authenticated;
