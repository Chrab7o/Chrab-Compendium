-- A region can now point at specific entries as well as (or instead of) a
-- tag query: "Burja" shows Burja City and Don Frogloni without either of them
-- needing a tag that nothing else carries. The panel shows the union of the
-- two. A plain uuid[] rather than a join table, same reasoning as
-- tag_query: only the client ever resolves it, and an entry that's since been
-- deleted just drops out on the client instead of needing a cascade.
--
-- region_tag_links gets the same column: a per-timeline override replaces
-- the region's whole target (tags and entries) for that one timeline.
-- Run via `npx supabase db push --linked`.
alter table map_regions add column if not exists entry_ids uuid[] not null default '{}';
alter table region_tag_links add column if not exists entry_ids uuid[] not null default '{}';
