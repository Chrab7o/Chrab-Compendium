-- The Chronicle: a world's in-world history as dated events on a line.
-- Named Chronicle, not "timeline", because timeline already means a
-- campaign in the map viewer (20260123000000_marker_region_timelines.sql).
--
-- Canon is every event with no branch. A branch splits off its parent line
-- (canon, or another branch) at fork_event_id, holds the events moved into
-- it, and optionally comes back at rejoin_event_id - the point where the
-- parent line "corrects itself". Events on the parent line after the rejoin
-- are that line's again. Layout and validation live in src/lib/chronicle.js.
-- Run via `npx supabase db push`.

-- A world's calendar: eras ({abbr, name, start_year, backward}) and months
-- ({name, days}). Event years are absolute; eras only change how a year is
-- written ("484 AC").
alter table worlds add column if not exists calendar jsonb not null
  default '{"eras": [], "months": []}'::jsonb;

create table if not exists chronicle_branches (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  description text,
  color text,
  parent_branch_id uuid references chronicle_branches(id) on delete set null,
  fork_event_id uuid,
  rejoin_event_id uuid,
  campaign_id uuid references campaigns(id) on delete set null,
  visibility text not null default 'public'
    check (visibility in ('public', 'dm')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint chronicle_branches_not_own_parent check (parent_branch_id is distinct from id)
);

create table if not exists chronicle_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  branch_id uuid references chronicle_branches(id) on delete set null,
  kind text not null default 'event' check (kind in ('event', 'date')),
  title text not null,
  summary text,
  year integer not null,
  month integer check (month is null or month >= 1),
  day integer check (day is null or day >= 1),
  tags text[] not null default '{}',
  campaign_id uuid references campaigns(id) on delete set null,
  visibility text not null default 'public'
    check (visibility in ('public', 'dm')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Added after chronicle_events exists: the two tables point at each other.
alter table chronicle_branches drop constraint if exists chronicle_branches_fork_event_fk;
alter table chronicle_branches add constraint chronicle_branches_fork_event_fk
  foreign key (fork_event_id) references chronicle_events(id) on delete set null;
alter table chronicle_branches drop constraint if exists chronicle_branches_rejoin_event_fk;
alter table chronicle_branches add constraint chronicle_branches_rejoin_event_fk
  foreign key (rejoin_event_id) references chronicle_events(id) on delete set null;

create table if not exists chronicle_event_entries (
  event_id uuid not null references chronicle_events(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  primary key (event_id, entry_id)
);

create index if not exists chronicle_events_world_idx on chronicle_events(world_id);
create index if not exists chronicle_branches_world_idx on chronicle_branches(world_id);
create index if not exists chronicle_event_entries_entry_idx on chronicle_event_entries(entry_id);

-- A branch is public only if it and every branch above it are. Walked in a
-- security definer function because a policy on chronicle_branches that
-- queried chronicle_branches would recurse.
create or replace function public.is_chronicle_branch_public(bid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with recursive chain as (
    select id, parent_branch_id, visibility, 1 as depth
    from chronicle_branches where id = bid
    union all
    select b.id, b.parent_branch_id, b.visibility, chain.depth + 1
    from chronicle_branches b
    join chain on b.id = chain.parent_branch_id
    where chain.depth < 50
  )
  select exists (select 1 from chain) and not exists (select 1 from chain where visibility = 'dm');
$$;

alter table chronicle_branches enable row level security;
alter table chronicle_events enable row level security;
alter table chronicle_event_entries enable row level security;

drop policy if exists "public branches are publicly readable" on chronicle_branches;
create policy "public branches are publicly readable"
  on chronicle_branches for select
  using (is_dm() or is_chronicle_branch_public(id));

drop policy if exists "dm manages branches" on chronicle_branches;
create policy "dm manages branches"
  on chronicle_branches for all
  using (is_dm())
  with check (is_dm());

-- Same tag rule as entries: a DM-only tag hides the event too.
drop policy if exists "public events are publicly readable" on chronicle_events;
create policy "public events are publicly readable"
  on chronicle_events for select
  using (
    is_dm()
    or (
      visibility = 'public'
      and is_tags_public(tags)
      and (branch_id is null or is_chronicle_branch_public(branch_id))
    )
  );

drop policy if exists "dm manages events" on chronicle_events;
create policy "dm manages events"
  on chronicle_events for all
  using (is_dm())
  with check (is_dm());

-- A link is visible when its event is; the entry's own RLS still decides
-- whether the entry itself loads.
drop policy if exists "event links visible if event is" on chronicle_event_entries;
create policy "event links visible if event is"
  on chronicle_event_entries for select
  using (exists (select 1 from chronicle_events e where e.id = event_id));

drop policy if exists "dm manages event links" on chronicle_event_entries;
create policy "dm manages event links"
  on chronicle_event_entries for all
  using (is_dm())
  with check (is_dm());
