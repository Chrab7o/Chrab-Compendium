-- Tags move from free-typed text to a DM-managed vocabulary, so the entry
-- editor can offer a checklist instead of a comma-separated text box, and
-- new tag-based nav pages (Locations/People/Session Notes) have a stable
-- set of values to expect rather than whatever anyone happened to type.
-- entries.tags stays a plain text[] (Postgres can't cleanly foreign-key
-- individual array elements) — this table is the selectable source of
-- truth the UI restricts to, not a hard DB constraint.
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table tags enable row level security;

drop policy if exists "tags are publicly readable" on tags;
create policy "tags are publicly readable"
  on tags for select
  using (true);

drop policy if exists "dm manages tags" on tags;
create policy "dm manages tags"
  on tags for all
  using (is_dm())
  with check (is_dm());

insert into tags (value, label, sort_order) values
  ('location', 'Location', 0),
  ('person', 'Person', 1),
  ('session-note', 'Session Note', 2)
on conflict (value) do nothing;
