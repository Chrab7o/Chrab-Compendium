-- Lets a public entry have a linked "DM Notes" child entry (visibility='dm')
-- instead of hiding secret text inside the same public row. Keeping secrets
-- in their own row means RLS actually hides them from anonymous API
-- responses — a hidden markdown block inside a public entry would not.
alter table entries add column if not exists parent_entry_id uuid references entries(id) on delete cascade;

create index if not exists entries_parent_entry_id_idx on entries(parent_entry_id);

-- Storage bucket for images embedded in entry content (separate from the
-- 'maps' bucket so the two can be managed/cleaned up independently).
insert into storage.buckets (id, name, public)
values ('entry-images', 'entry-images', true)
on conflict (id) do nothing;

drop policy if exists "entry images are publicly readable" on storage.objects;
create policy "entry images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'entry-images');

drop policy if exists "dm manages entry images" on storage.objects;
create policy "dm manages entry images"
  on storage.objects for all
  using (bucket_id = 'entry-images' and is_dm())
  with check (bucket_id = 'entry-images' and is_dm());
