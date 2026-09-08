-- Fix: dm_note on `characters` leaked to the character's own player, since
-- "owner reads own character" grants column-blind SELECT on that row (RLS
-- is row-level, not column-level) - the DM's private reminder text was
-- fetched into the player's browser via CharacterSheet.jsx's select('*').
-- Moving reminder notes to their own DM-only table fixes this and also
-- generalizes to NPCs (wiki entries), which have no equivalent private
-- column to add without hitting the exact same problem (entries are
-- publicly readable wiki content).
alter table characters drop column dm_note;

-- DM Screens are no longer campaign-specific - separate screens (tabs)
-- already give the DM what they wanted from campaign scoping, so a screen
-- is just a saved layout, usable regardless of which campaign is currently
-- selected elsewhere in the app.
drop index if exists dm_screens_campaign_id_idx;
alter table dm_screens drop column campaign_id;

-- Reminders can now be added for any character (PC) or any wiki entry
-- tagged "character" (an NPC), rather than automatically listing everyone
-- in a campaign. subject_id has no FK - it polymorphically references
-- either characters(id) or entries(id) depending on subject_type, and
-- Postgres can't express a conditional FK, so referential integrity here is
-- app-enforced, not DB-enforced. Fully DM-private RLS from the start avoids
-- the exact leak fixed above ever happening to this data.
create table dm_reminder_notes (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('character', 'entry')),
  subject_id uuid not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

create trigger dm_reminder_notes_set_updated_at before update on dm_reminder_notes
  for each row execute function set_updated_at();

alter table dm_reminder_notes enable row level security;
create policy "dm manages reminder notes" on dm_reminder_notes for all using (is_dm()) with check (is_dm());
