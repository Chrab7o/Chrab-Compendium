-- System-agnostic skill trees: a DM-authored tree of nodes (single-parent,
-- same shape as folders.parent_folder_id) that players unlock by spending
-- points tied to their own character. Not D&D/Foundry-specific — costs and
-- names are freeform, so this works for any system.
create table if not exists skill_trees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  campaign_id uuid references campaigns(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists skill_tree_nodes (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references skill_trees(id) on delete cascade,
  parent_node_id uuid references skill_tree_nodes(id) on delete cascade,
  name text not null,
  description text not null default '',
  cost integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists skill_tree_nodes_tree_id_idx on skill_tree_nodes(tree_id);
create index if not exists skill_tree_nodes_parent_idx on skill_tree_nodes(parent_node_id);

-- A character's point budget per tree. Set directly by the DM — there's no
-- universal "level" to derive it from automatically across systems. Points
-- *spent* is never stored here; it's computed from character_skill_unlocks,
-- the same computed-not-cascade-written approach used for folder visibility
-- and campaign inheritance elsewhere in this schema.
create table if not exists character_skill_trees (
  character_id uuid not null references characters(id) on delete cascade,
  tree_id uuid not null references skill_trees(id) on delete cascade,
  points_available integer not null default 0,
  primary key (character_id, tree_id)
);

create table if not exists character_skill_unlocks (
  character_id uuid not null references characters(id) on delete cascade,
  node_id uuid not null references skill_tree_nodes(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (character_id, node_id)
);

-- Row Level Security ------------------------------------------------------

alter table skill_trees enable row level security;

drop policy if exists "skill trees are publicly readable" on skill_trees;
create policy "skill trees are publicly readable"
  on skill_trees for select
  using (true);

drop policy if exists "dm manages skill trees" on skill_trees;
create policy "dm manages skill trees"
  on skill_trees for all
  using (is_dm())
  with check (is_dm());

alter table skill_tree_nodes enable row level security;

drop policy if exists "skill tree nodes are publicly readable" on skill_tree_nodes;
create policy "skill tree nodes are publicly readable"
  on skill_tree_nodes for select
  using (true);

drop policy if exists "dm manages skill tree nodes" on skill_tree_nodes;
create policy "dm manages skill tree nodes"
  on skill_tree_nodes for all
  using (is_dm())
  with check (is_dm());

alter table character_skill_trees enable row level security;

drop policy if exists "owner or dm reads skill points" on character_skill_trees;
create policy "owner or dm reads skill points"
  on character_skill_trees for select
  using (
    is_dm()
    or exists (select 1 from characters c where c.id = character_id and c.owner_id = auth.uid())
  );

drop policy if exists "dm manages skill points" on character_skill_trees;
create policy "dm manages skill points"
  on character_skill_trees for all
  using (is_dm())
  with check (is_dm());

alter table character_skill_unlocks enable row level security;

drop policy if exists "owner or dm reads unlocks" on character_skill_unlocks;
create policy "owner or dm reads unlocks"
  on character_skill_unlocks for select
  using (
    is_dm()
    or exists (select 1 from characters c where c.id = character_id and c.owner_id = auth.uid())
  );

-- Direct writes stay DM-only. Players unlock nodes exclusively through the
-- unlock_skill_node() function below, which is security definer and
-- validates ownership/prerequisite/points server-side before inserting —
-- a client can't just insert a row here and fake having enough points.
drop policy if exists "dm manages unlocks" on character_skill_unlocks;
create policy "dm manages unlocks"
  on character_skill_unlocks for all
  using (is_dm())
  with check (is_dm());

-- The only way a player unlocks a node for their own character.
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
  v_available int;
  v_spent int;
begin
  select owner_id into v_owner from characters where id = p_character_id;
  if v_owner is null or (v_owner <> auth.uid() and not is_dm()) then
    raise exception 'not your character';
  end if;

  select tree_id, parent_node_id, cost into v_tree_id, v_parent, v_cost
  from skill_tree_nodes where id = p_node_id;
  if v_tree_id is null then
    raise exception 'node not found';
  end if;

  if v_parent is not null and not exists (
    select 1 from character_skill_unlocks
    where character_id = p_character_id and node_id = v_parent
  ) then
    raise exception 'prerequisite not unlocked';
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

grant execute on function public.unlock_skill_node(uuid, uuid) to authenticated;
