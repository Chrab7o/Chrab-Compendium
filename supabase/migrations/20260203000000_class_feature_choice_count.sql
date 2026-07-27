-- 5etools' "options" block (the structured form of our choice_group) wants
-- a "count" - how many of the group the player picks. We had no equivalent;
-- null means "unspecified" (the wizard/detail page default to 1 when
-- displaying or exporting, but this stays null rather than defaulting to a
-- stored 1 so we can tell "DM never set this" apart from "DM picked 1").
alter table homebrew_class_features add column if not exists choice_count integer;
