-- Structured homebrew Races: the "Races" tab on the Homebrew page. A fixed
-- set of stat-line fields (size, speeds, senses, ability bonuses,
-- languages) plus a free list of traits - same split as homebrew_classes vs
-- homebrew_class_features. No subrace table: a subrace pick is modelled as a
-- trait with sub-features ("Subrace: choose 1 of the following"), the same
-- choice_group/choice_count shape class and subclass features already use.
create table homebrew_races (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  creature_type text not null default 'Humanoid',
  sizes text[] not null default '{Medium}',
  speed_walk integer not null default 30 check (speed_walk >= 0),
  speed_fly integer check (speed_fly >= 0),
  speed_swim integer check (speed_swim >= 0),
  speed_climb integer check (speed_climb >= 0),
  speed_burrow integer check (speed_burrow >= 0),
  darkvision integer check (darkvision >= 0),
  -- { "STR": 2, "WIS": 1 } - fixed bonuses only. Anything flexible ("+1 to
  -- two different scores of your choice") goes in ability_bonus_note.
  ability_bonuses jsonb not null default '{}',
  ability_bonus_note text not null default '',
  languages text[] not null default '{Common}',
  campaign_id uuid references campaigns(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table homebrew_race_traits (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references homebrew_races(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  choice_group text not null default '',
  choice_count integer
);
create index homebrew_race_traits_race_id_idx on homebrew_race_traits(race_id);

-- Reference content - same public-read / DM-write split as homebrew_classes.
alter table homebrew_races enable row level security;
create policy "homebrew races are publicly readable" on homebrew_races for select using (true);
create policy "dm manages homebrew races" on homebrew_races for all using (is_dm()) with check (is_dm());

alter table homebrew_race_traits enable row level security;
create policy "homebrew race traits are publicly readable" on homebrew_race_traits for select using (true);
create policy "dm manages homebrew race traits" on homebrew_race_traits for all using (is_dm()) with check (is_dm());
