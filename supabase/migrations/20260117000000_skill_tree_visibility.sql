-- Restrict a skill tree to specific players' characters, on top of its
-- existing campaign scoping. Opt-in/additive: a tree with no rows here is
-- visible to everyone in its campaign scope exactly as before. A tree with
-- any rows here becomes visible only to the DM plus the owners of those
-- specific characters.
create table if not exists skill_tree_visible_to (
  tree_id uuid not null references skill_trees(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  primary key (tree_id, character_id)
);

alter table skill_tree_visible_to enable row level security;

drop policy if exists "dm manages skill tree visibility" on skill_tree_visible_to;
create policy "dm manages skill tree visibility"
  on skill_tree_visible_to for all
  using (is_dm())
  with check (is_dm());

-- skill_trees/skill_tree_nodes were previously `select using (true)` (fully
-- public) — a real restriction has to live here, not just client-side
-- filtering, same "RLS is the actual boundary" rule as everywhere else.
create or replace function public.is_skill_tree_visible(p_tree_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_dm()
    or not exists (select 1 from skill_tree_visible_to where tree_id = p_tree_id)
    or exists (
      select 1 from skill_tree_visible_to v
      join characters c on c.id = v.character_id
      where v.tree_id = p_tree_id and c.owner_id = auth.uid()
    );
$$;

drop policy if exists "skill trees are publicly readable" on skill_trees;
create policy "skill trees are publicly readable"
  on skill_trees for select
  using (is_skill_tree_visible(id));

drop policy if exists "skill tree nodes are publicly readable" on skill_tree_nodes;
create policy "skill tree nodes are publicly readable"
  on skill_tree_nodes for select
  using (is_skill_tree_visible(tree_id));
