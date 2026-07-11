-- Support more than one prerequisite per node (e.g. two branches that
-- converge on the same unlock). parent_node_id stays the *structural*
-- parent — what the outline nests a node under — while this table holds
-- prerequisites beyond that one. A node's full prerequisite set is
-- {parent_node_id} union {rows here}. require_all_prereqs controls whether
-- that full set needs to be ALL unlocked (AND, the default) or just one of
-- them (OR) — e.g. a node reachable via either of two branches.
alter table skill_tree_nodes add column if not exists require_all_prereqs boolean not null default true;

create table if not exists skill_tree_node_prereqs (
  node_id uuid not null references skill_tree_nodes(id) on delete cascade,
  prereq_node_id uuid not null references skill_tree_nodes(id) on delete cascade,
  primary key (node_id, prereq_node_id),
  constraint skill_tree_node_prereqs_no_self check (node_id <> prereq_node_id)
);

create index if not exists skill_tree_node_prereqs_node_idx on skill_tree_node_prereqs(node_id);

alter table skill_tree_node_prereqs enable row level security;

drop policy if exists "skill tree node prereqs are publicly readable" on skill_tree_node_prereqs;
create policy "skill tree node prereqs are publicly readable"
  on skill_tree_node_prereqs for select
  using (true);

drop policy if exists "dm manages skill tree node prereqs" on skill_tree_node_prereqs;
create policy "dm manages skill tree node prereqs"
  on skill_tree_node_prereqs for all
  using (is_dm())
  with check (is_dm());

-- Rewritten to check the full prerequisite set (parent + extras) instead of
-- just parent_node_id, branching on require_all_prereqs. Ownership and
-- points checks are unchanged from the original version.
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
  v_require_all boolean;
  v_available int;
  v_spent int;
  v_total_prereqs int;
  v_unlocked_prereqs int;
begin
  select owner_id into v_owner from characters where id = p_character_id;
  if v_owner is null or (v_owner <> auth.uid() and not is_dm()) then
    raise exception 'not your character';
  end if;

  select tree_id, parent_node_id, cost, require_all_prereqs
  into v_tree_id, v_parent, v_cost, v_require_all
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

  if v_total_prereqs > 0 then
    if v_require_all and v_unlocked_prereqs < v_total_prereqs then
      raise exception 'prerequisites not unlocked';
    elsif not v_require_all and v_unlocked_prereqs = 0 then
      raise exception 'prerequisites not unlocked';
    end if;
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
