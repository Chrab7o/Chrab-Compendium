-- Categories move from a hardcoded list to a real DM-editable table, so new
-- top-level tabs (beyond Lore/NPC/Location/etc.) can be added from the app.
-- `value` is the stable slug entries/folders reference; `label` is the
-- display name and can be renamed freely without touching existing data.
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;

drop policy if exists "categories are publicly readable" on categories;
create policy "categories are publicly readable"
  on categories for select
  using (true);

drop policy if exists "dm manages categories" on categories;
create policy "dm manages categories"
  on categories for all
  using (is_dm())
  with check (is_dm());

insert into categories (value, label, sort_order) values
  ('lore', 'World Lore', 0),
  ('npc', 'NPC', 1),
  ('location', 'Location', 2),
  ('session-note', 'Session Note', 3),
  ('homebrew', 'Homebrew', 4),
  ('item', 'Item', 5)
on conflict (value) do nothing;

-- Swap the fixed CHECK constraints for a foreign key so newly-created
-- categories are usable immediately, with no code/schema change needed.
alter table entries drop constraint if exists entries_category_check;
alter table entries
  add constraint entries_category_fkey foreign key (category) references categories(value);

alter table folders drop constraint if exists folders_category_check;
alter table folders
  add constraint folders_category_fkey foreign key (category) references categories(value);
