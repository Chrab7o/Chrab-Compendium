-- Story Engine (sphere grid): a DM-only world-building board.
--
-- A sphere is a world-building node - a planet, a city, a faction, an era,
-- an arc title - with a name, free text, one tag, a stub flag and a GM-only
-- flag. There is deliberately NO hierarchy: no parent column, no tree, no
-- recursive walk. Spheres relate only through unlabeled, undirected links,
-- and the sphere text carries what a link means. Time is just another
-- sphere (an era or arc title), so linking to one is how history is kept.
--
-- This lives in its own tables rather than in `entries` on purpose: the
-- generation loop is expected to churn out lots of name-and-tag stubs, and
-- none of that belongs in player-facing wiki search. `gm_only` is kept on
-- each sphere for a later "publish to wiki" step; nothing here is readable
-- by players today regardless of it.
--
-- Run via `npx supabase db push`.

-- 1. Tags -----------------------------------------------------------------
-- A fixed vocabulary, setting-agnostic, seeded below. It is not the wiki's
-- `tags` table: those carry visibility and campaign scoping for player
-- search, while these only describe what kind of thing a sphere is.
create table if not exists story_tags (
  value text primary key,
  label text not null,
  sort_order integer not null default 0,
  color text
);

insert into story_tags (value, label, sort_order, color) values
  ('realm',      'Realm',      0,  '#5b2a86'),
  ('region',     'Region',     1,  '#2f6b3a'),
  ('settlement', 'Settlement', 2,  '#b5651d'),
  ('site',       'Site',       3,  '#8a5a12'),
  ('faction',    'Faction',    4,  '#a3172e'),
  ('character',  'Character',  5,  '#1f5fa8'),
  ('creature',   'Creature',   6,  '#4d7d14'),
  ('culture',    'Culture',    7,  '#c2410c'),
  ('belief',     'Belief',     8,  '#b8860b'),
  ('conflict',   'Conflict',   9,  '#d0212a'),
  ('era',        'Era',        10, '#0f766e'),
  ('arc',        'Arc',        11, '#7c2d92'),
  ('event',      'Event',      12, '#be185d'),
  ('artifact',   'Artifact',   13, '#0e7490'),
  ('concept',    'Concept',    14, '#475569')
on conflict (value) do nothing;

-- 2. Spheres --------------------------------------------------------------
-- Scoped to a world, so the engine stays setting-agnostic: each world gets
-- its own board. Whether boards should later share spheres is an open
-- question; one board per world is the simplest thing that can be widened.
create table if not exists story_spheres (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  body text not null default '',
  -- Optional at creation: an untagged sphere is valid and tagged later.
  tag text references story_tags(value) on update cascade on delete set null,
  -- A stub is expected (name and tag only) - the flag is how the board shows
  -- what still needs content. New spheres start as stubs.
  is_stub boolean not null default true,
  gm_only boolean not null default false,
  -- Board position. Spheres stay where they are put; nothing re-lays them out.
  x double precision not null default 0,
  y double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_spheres_world_id_idx on story_spheres(world_id);

drop trigger if exists story_spheres_set_updated_at on story_spheres;
create trigger story_spheres_set_updated_at
  before update on story_spheres
  for each row execute function set_updated_at();

-- 3. Links ----------------------------------------------------------------
-- Undirected, so each pair is stored once in canonical order (a < b). That
-- makes "are these two linked" a single unique lookup and stops the same
-- link from existing twice the other way round.
--
-- Deleting a sphere removes its links and nothing else - which is exactly
-- what the cascade does. There is no other cascade anywhere in the engine.
create table if not exists story_links (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  a uuid not null references story_spheres(id) on delete cascade,
  b uuid not null references story_spheres(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (a < b),
  unique (a, b)
);

create index if not exists story_links_world_id_idx on story_links(world_id);
create index if not exists story_links_b_idx on story_links(b);

-- 4. Generator pools ------------------------------------------------------
-- Curated name lists the DM builds by hand - generation only ever draws
-- from these (or from the installed syllable schemes), never invents. A pool
-- can be tied to a tag, which becomes the default tag of what it generates.
create table if not exists story_pools (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  tag text references story_tags(value) on update cascade on delete set null,
  names text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists story_pools_world_id_idx on story_pools(world_id);

-- Row Level Security -----------------------------------------------------
-- The whole engine is GM-only prep material, like item_maker_items.

alter table story_tags enable row level security;
alter table story_spheres enable row level security;
alter table story_links enable row level security;
alter table story_pools enable row level security;

drop policy if exists "dm reads story tags" on story_tags;
create policy "dm reads story tags"
  on story_tags for select
  using (is_dm());

drop policy if exists "dm manages story tags" on story_tags;
create policy "dm manages story tags"
  on story_tags for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "dm manages story spheres" on story_spheres;
create policy "dm manages story spheres"
  on story_spheres for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "dm manages story links" on story_links;
create policy "dm manages story links"
  on story_links for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "dm manages story pools" on story_pools;
create policy "dm manages story pools"
  on story_pools for all
  using (is_dm())
  with check (is_dm());
