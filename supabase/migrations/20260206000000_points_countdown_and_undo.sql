-- points_available used to be a fixed lifetime budget, with "spent" always
-- recomputed live from character_skill_unlocks/character_skill_crafts and
-- never subtracted from it — the DM found that confusing to grant against
-- ("do I type 600 or 300?"). This switches points_available to a live
-- balance that counts down as it's spent, while keeping the same unlock/
-- craft log tables so a "spent so far" stat can still be shown alongside it.

-- One-time fix-up: every existing row currently holds the *total ever
-- granted*, with real spend tracked only in the log tables. Subtract that
-- already-spent amount now so remaining balances don't jump the moment this
-- ships - this has to run before the functions below change what
-- points_available means going forward.
with spend as (
  select character_id, tree_type, sum(cost) as total
  from (
    select u.character_id, st.tree_type, n.cost
    from character_skill_unlocks u
    join skill_tree_nodes n on n.id = u.node_id
    join skill_trees st on st.id = n.tree_id
    union all
    select cr.character_id, st.tree_type, cr.cost
    from character_skill_crafts cr
    join skill_tree_nodes n on n.id = cr.node_id
    join skill_trees st on st.id = n.tree_id
  ) s
  group by character_id, tree_type
)
update character_skill_points csp
set points_available = csp.points_available - spend.total
from spend
where spend.character_id = csp.character_id and spend.tree_type = csp.tree_type;

-- Spends against the live balance directly instead of summing history for
-- the check - the log tables (character_skill_unlocks) still exist and are
-- still what "spent so far" is computed from for display, and what
-- dm_undo_skill_unlock below reads to know how much to refund.
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

  if exists (
    select 1 from character_skill_unlocks where character_id = p_character_id and node_id = p_node_id
  ) then
    raise exception 'already unlocked';
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

  select points_available into v_available
  from character_skill_points where character_id = p_character_id and tree_type = v_tree_type;
  -- No matching row leaves v_available NULL (not 0) - "cost > NULL" is NULL,
  -- and `if NULL` silently takes the false branch, which would let an
  -- unassigned character unlock nodes for free. Force it to 0 explicitly.
  v_available := coalesce(v_available, 0);

  if v_cost > v_available then
    raise exception 'not enough points';
  end if;

  insert into character_skill_unlocks (character_id, node_id)
  values (p_character_id, p_node_id);

  update character_skill_points
  set points_available = points_available - v_cost
  where character_id = p_character_id and tree_type = v_tree_type;

  perform notify_discord(
    format('%s unlocked **%s** in %s', v_character_name, v_node_name, v_tree_name)
  );
end;
$$;

grant execute on function public.unlock_skill_node(uuid, uuid) to authenticated;

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

-- DM-only: reverse an unlock and refund its cost (plus the cost of any
-- crafts made from it, which are removed too - a crafted item from a
-- recipe the character no longer knows doesn't make sense to leave
-- behind). Blocked if another still-unlocked node depends on this one, so
-- undoing a prerequisite never leaves a child unlocked past what it
-- actually qualifies for.
create or replace function public.dm_undo_skill_unlock(p_character_id uuid, p_node_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tree_type text;
  v_cost int;
  v_node_name text;
  v_character_name text;
  v_dependent_name text;
  v_craft_refund int;
begin
  if not is_dm() then
    raise exception 'dm only';
  end if;

  select n.cost, st.tree_type, n.name
  into v_cost, v_tree_type, v_node_name
  from skill_tree_nodes n
  join skill_trees st on st.id = n.tree_id
  where n.id = p_node_id;
  if v_tree_type is null then
    raise exception 'node not found';
  end if;

  if not exists (
    select 1 from character_skill_unlocks
    where character_id = p_character_id and node_id = p_node_id
  ) then
    raise exception 'node is not unlocked for this character';
  end if;

  select n2.name into v_dependent_name
  from character_skill_unlocks u2
  join skill_tree_nodes n2 on n2.id = u2.node_id
  where u2.character_id = p_character_id
  and u2.node_id <> p_node_id
  and (
    n2.parent_node_id = p_node_id
    or exists (
      select 1 from skill_tree_node_prereqs pr
      where pr.node_id = n2.id and pr.prereq_node_id = p_node_id
    )
  )
  limit 1;
  if v_dependent_name is not null then
    raise exception 'undo % first - it depends on this node', v_dependent_name;
  end if;

  select coalesce(sum(cost), 0) into v_craft_refund
  from character_skill_crafts
  where character_id = p_character_id and node_id = p_node_id;

  delete from character_skill_crafts
  where character_id = p_character_id and node_id = p_node_id;

  delete from character_skill_unlocks
  where character_id = p_character_id and node_id = p_node_id;

  update character_skill_points
  set points_available = points_available + v_cost + v_craft_refund
  where character_id = p_character_id and tree_type = v_tree_type;

  select name into v_character_name from characters where id = p_character_id;
  perform notify_discord(
    format('DM undid the unlock of **%s** for %s', v_node_name, v_character_name)
  );
end;
$$;

grant execute on function public.dm_undo_skill_unlock(uuid, uuid) to authenticated;
