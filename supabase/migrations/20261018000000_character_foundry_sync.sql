-- Re-importing a Foundry party export updates existing characters instead of
-- creating duplicates (which would orphan their skill-tree points, notes and
-- reminders). Foundry's actor _id is stable for the life of the actor, so it
-- is the match key.
--
-- Not unique: rows imported before this migration may already contain the
-- same actor twice, and a unique index would fail to build on them. The
-- importer updates every row that matches, and the DM can delete stragglers.
alter table characters add column foundry_id text;
create index characters_foundry_id_idx on characters(foundry_id);

-- Currency as its own column so shops can read and later spend it without
-- digging through raw_data. Synced from Foundry on every import, so Foundry
-- remains the source of truth for now. Shape: { pp, gp, ep, sp, cp }.
alter table characters add column currency jsonb not null default '{}'::jsonb;

update characters
set foundry_id = raw_data->>'_id',
    currency = coalesce(raw_data->'system'->'currency', '{}'::jsonb)
where source = 'foundry';
