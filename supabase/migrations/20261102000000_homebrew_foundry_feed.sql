-- The Plutonium feed (docs/homebrew-feed.md): every public homebrew class and
-- subclass as one 5etools file at a fixed public URL, with the Foundry
-- automation of linked Feature Forge drafts attached.
--
-- 1. A class or subclass feature row can name the Feature Forge draft that
--    automates it. "set null" on delete: removing a draft just drops the
--    automation, never the feature.
-- 2. A public storage bucket holds the built file. The DM's browser builds it
--    (lib/homebrewFeedPublish.js) and only DMs may write it. Anyone can read
--    it, the same as the public class pages it's built from; DM-only classes
--    and subclasses are never written into it.

alter table homebrew_class_features
  add column if not exists feature_draft_id uuid references feature_drafts(id) on delete set null;
create index if not exists homebrew_class_features_feature_draft_id_idx on homebrew_class_features(feature_draft_id);

alter table homebrew_subclass_features
  add column if not exists feature_draft_id uuid references feature_drafts(id) on delete set null;
create index if not exists homebrew_subclass_features_feature_draft_id_idx on homebrew_subclass_features(feature_draft_id);

insert into storage.buckets (id, name, public)
values ('foundry-feed', 'foundry-feed', true)
on conflict (id) do nothing;

drop policy if exists "foundry feed is publicly readable" on storage.objects;
create policy "foundry feed is publicly readable"
  on storage.objects for select
  using (bucket_id = 'foundry-feed');

drop policy if exists "dm writes the foundry feed" on storage.objects;
create policy "dm writes the foundry feed"
  on storage.objects for insert
  with check (bucket_id = 'foundry-feed' and is_dm());

drop policy if exists "dm updates the foundry feed" on storage.objects;
create policy "dm updates the foundry feed"
  on storage.objects for update
  using (bucket_id = 'foundry-feed' and is_dm())
  with check (bucket_id = 'foundry-feed' and is_dm());

drop policy if exists "dm deletes the foundry feed" on storage.objects;
create policy "dm deletes the foundry feed"
  on storage.objects for delete
  using (bucket_id = 'foundry-feed' and is_dm());
