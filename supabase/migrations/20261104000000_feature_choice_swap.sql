-- A choice group the player can change their mind on: on each level-up they
-- may swap one option they picked for another they have unlocked (the Dark
-- Knight's Dark Arts). Stored on the option rows like choice_count. The
-- Foundry class pack turns a swap group into one dnd5e ItemChoice across all
-- its levels with "replacement" on (docs/foundry-classes.md).
alter table homebrew_class_features add column if not exists choice_swap boolean not null default false;
alter table homebrew_subclass_features add column if not exists choice_swap boolean not null default false;
