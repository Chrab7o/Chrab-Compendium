-- All trees of the same tree_type now draw from one shared point pool per
-- character, instead of a separate pool per tree (a player should be able to
-- put their points toward Gunsmith or Lily Performances or Alchemist without
-- the DM juggling five separate point boxes for the same character). Scoped
-- by tree_type rather than "all trees regardless of type" so a future
-- Archetype Tree pool stays independent of the homebrew Feature Tree pool.
create table if not exists character_skill_points (
  character_id uuid not null references characters(id) on delete cascade,
  tree_type text not null check (tree_type in ('feature', 'archetype')),
  points_available integer not null default 0,
  primary key (character_id, tree_type)
);

-- Defensive: fold any existing per-tree points into the new per-type pool
-- before the old table is dropped (no rows exist today, but this keeps the
-- migration correct if that ever changes before it's applied).
insert into character_skill_points (character_id, tree_type, points_available)
select cst.character_id, st.tree_type, sum(cst.points_available)
from character_skill_trees cst
join skill_trees st on st.id = cst.tree_id
group by cst.character_id, st.tree_type
on conflict (character_id, tree_type) do update
  set points_available = character_skill_points.points_available + excluded.points_available;

drop table if exists character_skill_trees;

alter table character_skill_points enable row level security;

create policy "owner or dm reads skill points"
  on character_skill_points for select
  using (
    is_dm()
    or exists (select 1 from characters c where c.id = character_id and c.owner_id = auth.uid())
  );

create policy "dm manages skill points"
  on character_skill_points for all
  using (is_dm())
  with check (is_dm());

-- Rewritten to spend against the shared per-type pool: both "available" and
-- "already spent" are now summed across every tree that shares the unlocked
-- node's tree_type, not just the one tree it lives in.
create or replace function public.unlock_skill_node(p_character_id uuid, p_node_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_tree_id uuid;
  v_tree_type text;
  v_parent uuid;
  v_cost int;
  v_min_prereqs int;
  v_available int;
  v_spent int;
  v_total_prereqs int;
  v_unlocked_prereqs int;
  v_character_name text;
  v_node_name text;
  v_tree_name text;
begin
  select owner_id, name into v_owner, v_character_name from characters where id = p_character_id;
  if v_owner is null or (v_owner <> auth.uid() and not is_dm()) then
    raise exception 'not your character';
  end if;

  select n.tree_id, n.parent_node_id, n.cost, n.min_prereqs, n.name, st.tree_type, st.name
  into v_tree_id, v_parent, v_cost, v_min_prereqs, v_node_name, v_tree_type, v_tree_name
  from skill_tree_nodes n
  join skill_trees st on st.id = n.tree_id
  where n.id = p_node_id;
  if v_tree_id is null then
    raise exception 'node not found';
  end if;

  select
    count(*),
    count(*) filter (
      where exists (
        select 1 from character_skill_unlocks cu
        where cu.character_id = p_character_id and cu.node_id = prereq.id
      )
    )
  into v_total_prereqs, v_unlocked_prereqs
  from (
    select v_parent as id where v_parent is not null
    union
    select prereq_node_id as id from skill_tree_node_prereqs where node_id = p_node_id
  ) as prereq;

  if v_total_prereqs > 0 and v_unlocked_prereqs < coalesce(v_min_prereqs, v_total_prereqs) then
    raise exception 'prerequisites not unlocked';
  end if;

  select coalesce(points_available, 0) into v_available
  from character_skill_points where character_id = p_character_id and tree_type = v_tree_type;

  select coalesce(sum(n.cost), 0) into v_spent
  from character_skill_unlocks u
  join skill_tree_nodes n on n.id = u.node_id
  join skill_trees st on st.id = n.tree_id
  where u.character_id = p_character_id and st.tree_type = v_tree_type;

  if v_spent + v_cost > coalesce(v_available, 0) then
    raise exception 'not enough points';
  end if;

  insert into character_skill_unlocks (character_id, node_id)
  values (p_character_id, p_node_id)
  on conflict do nothing;

  perform notify_discord(
    format('%s unlocked **%s** in %s', v_character_name, v_node_name, v_tree_name)
  );
end;
$$;

grant execute on function public.unlock_skill_node(uuid, uuid) to authenticated;

-- Discord notifications --------------------------------------------------
-- Locked down completely: no RLS policies at all, so nothing short of a
-- security-definer function (which bypasses RLS as the table owner) can
-- read or write it. The webhook URL is a bearer credential for your Discord
-- channel - if a player could read it, they could post as "the DM" from
-- outside the app entirely.
create table if not exists app_secrets (
  key text primary key,
  value text not null default ''
);

alter table app_secrets enable row level security;

-- DM-only setter so the webhook URL can be configured from the running app
-- (or a one-off authenticated script) without ever needing to appear in a
-- migration file, which - unlike this table - ends up committed to git.
create or replace function public.set_app_secret(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_dm() then
    raise exception 'dm only';
  end if;
  insert into app_secrets (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;

grant execute on function public.set_app_secret(text, text) to authenticated;

create extension if not exists pg_net;

-- Fires a Discord message via the webhook stored in app_secrets under
-- 'discord_webhook_url'. A no-op (not an error) when that hasn't been set
-- yet, so unlocking never breaks for a DM who hasn't wired Discord up.
create or replace function public.notify_discord(p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  select value into v_url from app_secrets where key = 'discord_webhook_url';
  if v_url is null or v_url = '' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('content', p_message)
  );
end;
$$;
