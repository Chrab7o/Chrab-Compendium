-- Some level's features are really a menu the player picks from (e.g. a
-- Dark Knight picking 2 of 7 Dark Arts at level 2), not one feature everyone
-- gets. choice_group names that menu so the detail page can box those
-- options together and visually distinguish them from a normal single
-- feature at the same level - empty string (the default) means "not part of
-- a choice group," same convention as other optional freeform text fields
-- in this schema (e.g. skill_tree_nodes.description).
alter table homebrew_class_features add column if not exists choice_group text not null default '';
