-- Generalizes require_all_prereqs (ALL vs ANY ONE) into a minimum-count
-- requirement: min_prereqs null means "require all" (dynamic - adjusts
-- automatically if prereqs are added/removed later, same as the old ALL
-- behavior), a specific number N means "require at least N of the full
-- prerequisite set (parent + extras)" - e.g. Intermediate Alchemical
-- Knowledge needing any 4 of its 8 basic-tier potions, not all 8.
alter table skill_tree_nodes add column if not exists min_prereqs integer;

-- Preserve existing meaning: require_all_prereqs=false (ANY ONE) becomes
-- min_prereqs=1; true (ALL) stays null.
update skill_tree_nodes set min_prereqs = 1 where require_all_prereqs = false;

alter table skill_tree_nodes drop column if exists require_all_prereqs;

create or replace function public.unlock_skill_node(p_character_id uuid, p_node_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_tree_id uuid;
  v_parent uuid;
  v_cost int;
  v_min_prereqs int;
  v_available int;
  v_spent int;
  v_total_prereqs int;
  v_unlocked_prereqs int;
begin
  select owner_id into v_owner from characters where id = p_character_id;
  if v_owner is null or (v_owner <> auth.uid() and not is_dm()) then
    raise exception 'not your character';
  end if;

  select tree_id, parent_node_id, cost, min_prereqs
  into v_tree_id, v_parent, v_cost, v_min_prereqs
  from skill_tree_nodes where id = p_node_id;
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
  from character_skill_trees where character_id = p_character_id and tree_id = v_tree_id;

  select coalesce(sum(n.cost), 0) into v_spent
  from character_skill_unlocks u
  join skill_tree_nodes n on n.id = u.node_id
  where u.character_id = p_character_id and n.tree_id = v_tree_id;

  if v_spent + v_cost > coalesce(v_available, 0) then
    raise exception 'not enough points';
  end if;

  insert into character_skill_unlocks (character_id, node_id)
  values (p_character_id, p_node_id)
  on conflict do nothing;
end;
$$;
