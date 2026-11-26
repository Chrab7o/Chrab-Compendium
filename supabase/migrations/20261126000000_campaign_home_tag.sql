-- The home-page tag: an entry carrying it is the quick-start page the world
-- page shows for its campaign (entries.campaign_id, or a campaign mirror tag).
-- Just a Role tag so it shows in the tag picker; the world page does the rest.
-- Run via `npx supabase db push --linked`.
insert into tags (value, label, sort_order, group_id, description)
select 'home-page', 'Home Page', 20, g.id,
       'Shows this entry as its campaign''s home page on the world page.'
from tag_groups g
where g.value = 'role'
on conflict (value) do nothing;
