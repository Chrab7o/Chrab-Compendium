-- Make the Type group a real list of kinds.
--
-- Type is the wiki's exclusive + required group ("what is this entry"), but
-- after the folder conversion it only held `worlds` and `homebrew` - and 70
-- of 73 entries were Type "Worlds", which says nothing about them (it was
-- just the name of a top-level folder). Meanwhile the actual kinds lived in
-- Role.
--
--   * location, person, organization, event move from Role into Type, so
--     they line up with the Sphere Grid's top-level kinds and every entry can
--     have a meaningful type.
--   * worlds moves out of Type into Collection, the group every other folder
--     leftover lives in. Entries keep the tag, so search by it still works;
--     they simply have no Type until one is set (the entry editor asks).
--   * homebrew stays a Type.
--
-- No entry's tags change - only which group each tag belongs to.
--
-- Run via `npx supabase db push`.

update tags t
set group_id = g.id,
    sort_order = v.sort_order,
    color = coalesce(t.color, v.color)
from (values
  ('location', 0, '#2f6b3a'),
  ('person', 1, '#1f5fa8'),
  ('organization', 2, '#a3172e'),
  ('event', 3, '#7c2d92'),
  ('homebrew', 4, '#b5651d')
) as v(value, sort_order, color),
tag_groups g
where g.value = 'type' and t.value = v.value;

update tags t
set group_id = g.id
from tag_groups g
where g.value = 'collection' and t.value = 'worlds';
