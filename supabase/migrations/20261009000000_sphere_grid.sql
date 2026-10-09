-- Story Engine -> Sphere Grid: spheres become wiki entries.
--
-- The first cut (20261008000000_story_engine.sql) kept spheres in their own
-- tables with their own fixed tag list. The grid is now a way to explore and
-- view the wiki's own entries in an interconnected format - and a graphical
-- way to create them - so there is one entry model and one tag system:
--
--   sphere           = an entry (title, content, tags, visibility)
--   stub flag        = entries.is_stub (new)
--   GM-only flag     = entries.visibility = 'dm'
--   link             = entry_links, between entries, shown on every grid
--   sphere grid      = sphere_grids, a named view; sphere_grid_nodes holds
--                      where each entry sits on that grid. One entry can sit
--                      on many grids, at a different spot on each.
--   name pool        = name_pools, shared by every grid, defaulting to wiki
--                      tags instead of a story tag
--
-- Still no hierarchy: links are unlabeled and undirected, and deleting an
-- entry removes its links (cascade) and nothing else in this feature.
--
-- Run via `npx supabase db push`.

-- 1. Stub flag ------------------------------------------------------------
-- "Name and tag only, still needs content." Lets the grid show what is
-- unfinished without guessing from content length.
alter table entries add column if not exists is_stub boolean not null default false;

-- 2. Links between entries --------------------------------------------------
-- Stored once per pair in canonical order (a < b), so "are these linked" is
-- one unique lookup and a link can't exist twice the other way round.
create table if not exists entry_links (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references entries(id) on delete cascade,
  b uuid not null references entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (a < b),
  unique (a, b)
);

create index if not exists entry_links_b_idx on entry_links(b);

alter table entry_links enable row level security;

-- A link is readable only when both ends are - the subqueries run under the
-- reader's own entries RLS, so a link can never reveal a DM-only entry's id
-- to a player. Nothing player-facing reads links yet; this just keeps the
-- table safe for when something does.
drop policy if exists "links visible if both entries are" on entry_links;
create policy "links visible if both entries are"
  on entry_links for select
  using (
    exists (select 1 from entries e where e.id = entry_links.a)
    and exists (select 1 from entries e where e.id = entry_links.b)
  );

drop policy if exists "dm manages entry links" on entry_links;
create policy "dm manages entry links"
  on entry_links for all
  using (is_dm())
  with check (is_dm());

-- 3. Grids ----------------------------------------------------------------
create table if not exists sphere_grids (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Where an entry sits on a grid. Removing a node takes the entry off that
-- grid only; the entry and its links are untouched.
create table if not exists sphere_grid_nodes (
  grid_id uuid not null references sphere_grids(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  primary key (grid_id, entry_id)
);

create index if not exists sphere_grid_nodes_entry_id_idx on sphere_grid_nodes(entry_id);

alter table sphere_grids enable row level security;
alter table sphere_grid_nodes enable row level security;

drop policy if exists "dm manages sphere grids" on sphere_grids;
create policy "dm manages sphere grids"
  on sphere_grids for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "dm manages sphere grid nodes" on sphere_grid_nodes;
create policy "dm manages sphere grid nodes"
  on sphere_grid_nodes for all
  using (is_dm())
  with check (is_dm());

-- 4. Name pools -----------------------------------------------------------
-- Curated name lists shared by every grid. `tags` are wiki tag values that
-- new entries generated from the pool start with.
create table if not exists name_pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tags text[] not null default '{}',
  names text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table name_pools enable row level security;

drop policy if exists "dm manages name pools" on name_pools;
create policy "dm manages name pools"
  on name_pools for all
  using (is_dm())
  with check (is_dm());

-- 5. Carry over anything made with the first cut ---------------------------
-- Spheres become DM-only entries (none of them were ever player-visible, so
-- none become so now), each world's board becomes a grid named after the
-- world, and links/pools move across. Story tags have no wiki counterpart,
-- so they are dropped rather than guessed at.
create temporary table sphere_map as
select s.*, gen_random_uuid() as entry_id
from story_spheres s;

insert into entries (id, title, content, visibility, tags, is_stub)
select entry_id, name, body, 'dm', '{}', is_stub
from sphere_map;

insert into sphere_grids (id, name)
select w.id, w.name
from worlds w
where exists (select 1 from sphere_map m where m.world_id = w.id);

insert into sphere_grid_nodes (grid_id, entry_id, x, y)
select world_id, entry_id, x, y
from sphere_map;

insert into entry_links (a, b)
select least(ma.entry_id, mb.entry_id), greatest(ma.entry_id, mb.entry_id)
from story_links l
join sphere_map ma on ma.id = l.a
join sphere_map mb on mb.id = l.b
on conflict (a, b) do nothing;

insert into name_pools (name, names)
select name, names from story_pools;

drop table sphere_map;

-- 6. Retire the first cut's tables ----------------------------------------
drop table if exists story_links;
drop table if exists story_pools;
drop table if exists story_spheres;
drop table if exists story_tags;
