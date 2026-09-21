-- Long-term planning: a standing list of things the DM wants to remember to
-- do at some point, as opposed to the beat-by-beat prep in session_plans.
-- Deliberately flat and unlinked - no campaign_id, no entry references - so
-- jotting something down is one keystroke away and nothing has to be
-- classified first. Cross-links can be added later without reshaping this.
--
-- `timing` is free text on purpose ("next session", "once they hit level 5",
-- "before the wedding arc"): the useful answer is rarely a date, and forcing
-- one would mean inventing a fake deadline for most rows.
create table long_term_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text not null default '',
  timing text not null default '',
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index long_term_plans_done_sort_idx on long_term_plans(done, sort_order);

drop trigger if exists long_term_plans_set_updated_at on long_term_plans;
create trigger long_term_plans_set_updated_at
  before update on long_term_plans
  for each row execute function set_updated_at();

-- DM-only prep material, same as session_plans: no public select policy at
-- all, unlike the public-read/DM-write split most of this schema uses.
alter table long_term_plans enable row level security;
create policy "dm manages long term plans"
  on long_term_plans for all
  using (is_dm())
  with check (is_dm());
