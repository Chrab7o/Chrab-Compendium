-- Crafting cost used to be one flat number per tree, applied uniformly to
-- every craftable node in it - the DM pointed out a craftable item's cost
-- has no reason to match its unlock cost, and by the same logic there's no
-- reason every craftable node in a tree should cost the same to craft as
-- each other either. Moves craft cost to the node, same granularity unlock
-- cost already has.
alter table skill_tree_nodes add column if not exists craft_cost integer not null default 20;

-- Backfill: give every existing craftable node whatever its tree's flat
-- rate already was, so no character's crafting cost changes the moment
-- this ships - only newly-adjusted nodes going forward will differ.
update skill_tree_nodes n
set craft_cost = st.craft_cost
from skill_trees st
where st.id = n.tree_id and n.craftable;

alter table skill_trees drop column if exists craft_cost;

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
begin
  select owner_id, name into v_owner, v_character_name from characters where id = p_character_id;
  if v_owner is null or (v_owner <> auth.uid() and not is_dm()) then
    raise exception 'not your character';
  end if;

  select n.name, n.craftable, n.craft_cost, st.id, st.tree_type, st.name
  into v_node_name, v_craftable, v_craft_cost, v_tree_id, v_tree_type, v_tree_name
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

  select points_available into v_available
  from character_skill_points where character_id = p_character_id and tree_type = v_tree_type;
  v_available := coalesce(v_available, 0);

  if v_craft_cost > v_available then
    raise exception 'not enough points';
  end if;

  insert into character_skill_crafts (character_id, node_id, cost)
  values (p_character_id, p_node_id, v_craft_cost);

  update character_skill_points
  set points_available = points_available - v_craft_cost
  where character_id = p_character_id and tree_type = v_tree_type;

  perform notify_discord(
    format('%s crafted **%s** (%s, %s XP)', v_character_name, v_node_name, v_tree_name, v_craft_cost)
  );
end;
$$;

grant execute on function public.craft_skill_item(uuid, uuid) to authenticated;
revoke execute on function public.craft_skill_item(uuid, uuid) from anon;
