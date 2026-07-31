-- Lets the DM pre-configure how much XP a character gets for a normal
-- night of downtime (most players get the same 3x20, some who get less
-- rest get more) instead of it being a flat constant everyone shares -
-- then grant it with one click per character, or all at once.
alter table character_skill_points add column if not exists downtime_xp integer not null default 60;
