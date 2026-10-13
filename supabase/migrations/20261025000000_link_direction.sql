-- Direction on Sphere Grid links: "B is inside A".
--
-- Until now every link was a plain, undirected line, so from B's side the
-- kingdom it sits in and the taverns inside it looked the same. A link can now
-- name one of its two ends as the parent - the end that contains the other.
-- Null keeps it a plain link, which is what every existing link stays.
--
-- Pairs are still stored once in canonical order (a < b), so direction is a
-- column rather than a swap of a/b. Cycles (A inside B inside A) are refused
-- by the grid page; nothing here depends on the links forming a tree, so the
-- database doesn't police it.
--
-- Run via `npx supabase db push`.

alter table entry_links add column if not exists parent uuid;

alter table entry_links drop constraint if exists entry_links_parent_is_an_end;
alter table entry_links
  add constraint entry_links_parent_is_an_end check (parent is null or parent = a or parent = b);
