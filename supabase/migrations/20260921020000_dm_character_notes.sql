-- Long-form DM notes about a player character: who they are (bio), where
-- the DM intends to take them (arc), and anything else worth keeping.
--
-- Separate from dm_reminder_notes, which is one short line shown on the DM
-- screen during play and is polymorphic across PCs and NPC entries. This is
-- prep writing, only ever about a real character row - so it gets a proper
-- foreign key and cascades away with the character.
create table dm_character_notes (
  character_id uuid primary key references characters(id) on delete cascade,
  bio text not null default '',
  arc text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists dm_character_notes_set_updated_at on dm_character_notes;
create trigger dm_character_notes_set_updated_at
  before update on dm_character_notes
  for each row execute function set_updated_at();

-- DM-private from the start, like dm_reminder_notes and session_plans: a
-- player must never be able to read the arc planned for their character.
alter table dm_character_notes enable row level security;
create policy "dm manages character notes"
  on dm_character_notes for all
  using (is_dm())
  with check (is_dm());
