-- A long rest's XP is a fixed amount that doesn't change from session to
-- session, unlike downtime_xp (which the DM retunes per character as their
-- routine changes). They were sharing one field, so awarding a long rest
-- meant retyping the downtime amount, granting, and typing it back - and
-- forgetting that last step silently gave the wrong award next time.
-- Separate column, separate button, nothing to retype.
alter table character_skill_points add column if not exists long_rest_xp integer not null default 20;
