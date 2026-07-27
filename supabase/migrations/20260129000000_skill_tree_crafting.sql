-- Crafting: a player can turn an already-unlocked craftable node (e.g. a
-- learned potion recipe) into an actual item by spending a flat XP cost,
-- repeatable — unlike unlocking a node (a one-time purchase), a character
-- can craft the same node many times. The cost is set per tree (not a
-- single global constant) since different Feature Trees may want different
-- flat crafting costs, mirroring how the drawio importer already writes a
-- "flat 20xp" note into each imported tree's description.
alter table skill_trees add column if not exists craft_cost integer not null default 20;

-- Append-only log rather than a running total, same "computed not
-- cascade-written" approach as character_skill_unlocks — total XP spent on
-- crafting is summed from here at read time, never stored redundantly.
create table if not exists character_skill_crafts (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  node_id uuid not null references skill_tree_nodes(id) on delete cascade,
  cost integer not null,
  crafted_at timestamptz not null default now()
);

create index if not exists character_skill_crafts_character_id_idx on character_skill_crafts(character_id);
create index if not exists character_skill_crafts_node_id_idx on character_skill_crafts(node_id);

alter table character_skill_crafts enable row level security;

create policy "owner or dm reads crafts"
  on character_skill_crafts for select
  using (
    is_dm()
    or exists (select 1 from characters c where c.id = character_id and c.owner_id = auth.uid())
  );

-- Same split as character_skill_unlocks: direct writes stay DM-only, the
-- craft_skill_item() function below is the only way a player crafts for
-- their own character (security definer, validates everything server-side).
create policy "dm manages crafts"
  on character_skill_crafts for all
  using (is_dm())
  with check (is_dm());

create or replace function public.craft_skill_item(p_character_id uuid, p_node_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_character_name text;
  v_tree_id uuid;
  v_tree_type text;
  v_tree_name text;
  v_craft_cost int;
  v_node_name text;
  v_craftable boolean;
  v_available int;
  v_spent int;
begin
  select owner_id, name into v_owner, v_character_name from characters where id = p_character_id;
  if v_owner is null or (v_owner <> auth.uid() and not is_dm()) then
    raise exception 'not your character';
  end if;

  select n.name, n.craftable, st.id, st.tree_type, st.name, st.craft_cost
  into v_node_name, v_craftable, v_tree_id, v_tree_type, v_tree_name, v_craft_cost
  from skill_tree_nodes n
  join skill_trees st on st.id = n.tree_id
  where n.id = p_node_id;
  if v_tree_id is null then
    raise exception 'node not found';
  end if;
  if not v_craftable then
    raise exception 'this node is not craftable';
  end if;

  if not exists (
    select 1 from character_skill_unlocks
    where character_id = p_character_id and node_id = p_node_id
  ) then
    raise exception 'unlock this node before crafting it';
  end if;

  select coalesce(points_available, 0) into v_available
  from character_skill_points where character_id = p_character_id and tree_type = v_tree_type;

  select
    coalesce((
      select sum(n.cost) from character_skill_unlocks u
      join skill_tree_nodes n on n.id = u.node_id
      join skill_trees st on st.id = n.tree_id
      where u.character_id = p_character_id and st.tree_type = v_tree_type
    ), 0)
    + coalesce((
      select sum(cr.cost) from character_skill_crafts cr
      join skill_tree_nodes n on n.id = cr.node_id
      join skill_trees st on st.id = n.tree_id
      where cr.character_id = p_character_id and st.tree_type = v_tree_type
    ), 0)
  into v_spent;

  if v_spent + v_craft_cost > coalesce(v_available, 0) then
    raise exception 'not enough points';
  end if;

  insert into character_skill_crafts (character_id, node_id, cost)
  values (p_character_id, p_node_id, v_craft_cost);

  perform notify_discord(
    format('%s crafted **%s** (%s, %s XP)', v_character_name, v_node_name, v_tree_name, v_craft_cost)
  );
end;
$$;

grant execute on function public.craft_skill_item(uuid, uuid) to authenticated;
revoke execute on function public.craft_skill_item(uuid, uuid) from anon;
