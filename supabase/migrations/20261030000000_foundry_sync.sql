-- Phase 2 of the NPC Forge: a send-to-Foundry queue that the Chrab Sync
-- Foundry module (foundry/chrab-sync/) pulls from. See docs/npc-forge-phase2.md.
--
-- Security model: Foundry module files are public (anyone with the server URL
-- can download them) and modules only run in the browser, so the module holds
-- no secrets. Instead it signs in as a dedicated `foundry-sync` user whose
-- profile role is 'sync'. That role gets NO table policies at all - it can
-- only call the security-definer RPCs below, each of which checks
-- is_sync() or is_dm() and touches nothing but the sync fields. If its
-- session ever leaked, the worst case is reading queued NPC statblocks and
-- marking them synced/failed.

-- 1. The role ------------------------------------------------------------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('dm', 'player', 'sync'));

create or replace function public.is_sync()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'sync'
  );
$$;

-- 2. Queue fields on the drafts -------------------------------------------
-- queued_actor is the Foundry actor JSON the site built at send time (the
-- builder only lives on the site, so the module never has to rebuild it and
-- Foundry gets exactly what was previewed). It's kept after a sync so later
-- phases can diff against what Foundry last received.
alter table npc_drafts
  add column if not exists sync_status text not null default 'draft'
    check (sync_status in ('draft', 'queued', 'synced', 'failed')),
  add column if not exists queued_actor jsonb,
  add column if not exists queued_at timestamptz,
  add column if not exists synced_at timestamptz,
  add column if not exists sync_error text,
  add column if not exists foundry_actor_uuid text,
  add column if not exists foundry_world_id text,
  -- "Changed since sent" needs to know when the statblock itself last
  -- changed - updated_at also moves when a sync result is recorded.
  add column if not exists spec_updated_at timestamptz not null default now();

-- queued_at is stamped here too, not by the browser: a Send from the editor
-- saves the spec and queues in one update, and both stamps must come from the
-- same clock (now() is fixed per transaction) or the draft would read as
-- "Changed since sent" the moment Foundry applies it.
create or replace function public.npc_drafts_touch_spec()
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
    or new.queued_actor is distinct from old.queued_actor
  ) then
    new.queued_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists npc_drafts_touch_spec on npc_drafts;
create trigger npc_drafts_touch_spec
  before insert or update on npc_drafts
  for each row execute function npc_drafts_touch_spec();

-- 3. Which Foundry worlds are talking to us -------------------------------
-- Written only by sync_heartbeat; lets the site show "Eclipse of the Burning
-- Sun - last seen 5 min ago" so the DM can tell the module is alive.
create table if not exists foundry_worlds (
  world_id text primary key,
  title text not null default '',
  campaign_id uuid references campaigns(id) on delete set null,
  module_version text not null default '',
  last_seen_at timestamptz not null default now()
);

alter table foundry_worlds enable row level security;
drop policy if exists "dm manages foundry worlds" on foundry_worlds;
create policy "dm manages foundry worlds"
  on foundry_worlds for all
  using (is_dm())
  with check (is_dm());

-- 4. The RPCs the module calls ---------------------------------------------
create or replace function public.sync_pull_npcs(p_campaign_id uuid)
returns table (
  id uuid,
  name text,
  cr numeric,
  queued_actor jsonb,
  queued_at timestamptz,
  foundry_actor_uuid text
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
    select d.id, d.name, d.cr, d.queued_actor, d.queued_at, d.foundry_actor_uuid
    from npc_drafts d
    where d.campaign_id = p_campaign_id
      and d.sync_status = 'queued'
      and d.queued_actor is not null
    order by d.queued_at;
end;
$$;

-- p_queued_at must match the queue entry the module actually applied: if the
-- DM re-sent the NPC while Foundry was applying the older copy, the report is
-- ignored and the newer copy stays queued.
create or replace function public.sync_report_npc(
  p_draft_id uuid,
  p_queued_at timestamptz,
  p_world_id text,
  p_actor_uuid text,
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
  update npc_drafts
    set sync_status = case when p_error is null then 'synced' else 'failed' end,
        synced_at = case when p_error is null then now() else synced_at end,
        sync_error = p_error,
        foundry_actor_uuid = coalesce(p_actor_uuid, foundry_actor_uuid),
        foundry_world_id = coalesce(p_world_id, foundry_world_id)
    where id = p_draft_id
      and sync_status = 'queued'
      and queued_at = p_queued_at;
  get diagnostics touched = row_count;
  return touched > 0;
end;
$$;

create or replace function public.sync_heartbeat(
  p_world_id text,
  p_title text,
  p_campaign_id uuid,
  p_version text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_sync() or is_dm()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into foundry_worlds (world_id, title, campaign_id, module_version, last_seen_at)
    values (p_world_id, coalesce(p_title, ''), p_campaign_id, coalesce(p_version, ''), now())
  on conflict (world_id) do update
    set title = excluded.title,
        campaign_id = excluded.campaign_id,
        module_version = excluded.module_version,
        last_seen_at = now();
end;
$$;

revoke execute on function public.sync_pull_npcs(uuid) from public, anon;
revoke execute on function public.sync_report_npc(uuid, timestamptz, text, text, text) from public, anon;
revoke execute on function public.sync_heartbeat(text, text, uuid, text) from public, anon;
grant execute on function public.sync_pull_npcs(uuid) to authenticated;
grant execute on function public.sync_report_npc(uuid, timestamptz, text, text, text) to authenticated;
grant execute on function public.sync_heartbeat(text, text, uuid, text) to authenticated;
