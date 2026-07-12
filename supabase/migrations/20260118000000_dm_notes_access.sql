-- The DM could already read every player's notes but not write them, so
-- there was no way to take notes on a player's behalf while "viewing as"
-- them for testing/support. Adds the missing write path -- same shape as
-- every other DM-write policy in this schema. Existing owner-manages-own
-- and DM-read policies are unchanged.
drop policy if exists "dm manages all notes" on player_notes;
create policy "dm manages all notes"
  on player_notes for all
  using (is_dm())
  with check (is_dm());
