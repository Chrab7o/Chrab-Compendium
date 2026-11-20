-- Each campaign ("timeline") can name the map the world page should open on
-- when that timeline is picked, e.g. one era's overview map vs another's.
-- Null means "no preference": the world page falls back to the world's
-- first map by name, same as before. Run via `npx supabase db push`.
alter table campaigns add column if not exists default_map_id uuid references maps(id) on delete set null;
