-- Groundwork for supporting more than one tree "system" going forward: the
-- existing homebrew D&D trees are Feature Trees; an eventual separate
-- Battle Core system will use Archetype Trees. tree_type just labels which
-- one a tree is (drives display terminology) - no behavior differs between
-- them yet, and every existing row becomes 'feature' since that's all that
-- exists today.
alter table skill_trees
  add column if not exists tree_type text not null default 'feature'
    check (tree_type in ('feature', 'archetype'));

-- Marks an individual node as a craftable recipe/item (e.g. a potion in an
-- Alchemist Feature Tree) rather than a plain passive feature - groundwork
-- for a later crafting system to know which unlocked nodes are craftable.
-- Node-level, not tree-level: one tree can mix craftable items with
-- ordinary features.
alter table skill_tree_nodes
  add column if not exists craftable boolean not null default false;
