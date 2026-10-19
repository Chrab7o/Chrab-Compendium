-- Structured homebrew Feats and Backgrounds: the last two tabs on the
-- Homebrew page. Same split as homebrew_races - a fixed set of stat-line
-- fields on the parent row plus a free list of child rows (a feat's
-- benefits, a background's features) in the shared trait shape, with
-- choice_group/choice_count for "choose one of the following" sub-rows.
--
-- The fields mirror what 5etools' feats.json / backgrounds.json carry, so
-- the 5etools import/export maps onto them field-for-field. Where 5etools
-- has a structured shape too varied to be worth modelling (feat
-- prerequisites, starting equipment) we keep free text instead.

create table homebrew_feats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  -- 'General' | 'Origin' | 'Fighting Style' | 'Epic Boon' | anything else.
  -- Free text so a homebrew category doesn't need a migration.
  category text not null default '',
  -- "Level 4+, Strength 13+" - free text, see header comment.
  prerequisite text not null default '',
  repeatable boolean not null default false,
  -- Same shape as homebrew_races: fixed bonuses in the jsonb, anything
  -- flexible ("+1 to Intelligence, Wisdom, or Charisma") in the note.
  ability_bonuses jsonb not null default '{}',
  ability_bonus_note text not null default '',
  visibility text not null default 'dm' check (visibility in ('public', 'dm')),
  created_at timestamptz not null default now()
);

create table homebrew_feat_benefits (
  id uuid primary key default gen_random_uuid(),
  feat_id uuid not null references homebrew_feats(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  choice_group text not null default '',
  choice_count integer
);
create index homebrew_feat_benefits_feat_id_idx on homebrew_feat_benefits(feat_id);

create table homebrew_backgrounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  -- 2024-style: the three abilities a player spreads +2/+1 or +1/+1/+1
  -- across, as ability codes ('STR'..'CHA'). Empty for 2014-style
  -- backgrounds, which grant no ability increase.
  ability_options text[] not null default '{}',
  ability_note text not null default '',
  -- The origin feat granted, by name ("Magic Initiate (Wizard)"). Not a
  -- foreign key: it may be an official feat, not one of ours. The detail
  -- page links it when a homebrew feat of that name exists.
  feat text not null default '',
  skill_proficiencies text[] not null default '{}',
  tool_proficiencies text[] not null default '{}',
  languages text[] not null default '{}',
  equipment text not null default '',
  visibility text not null default 'dm' check (visibility in ('public', 'dm')),
  created_at timestamptz not null default now()
);

create table homebrew_background_features (
  id uuid primary key default gen_random_uuid(),
  background_id uuid not null references homebrew_backgrounds(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  choice_group text not null default '',
  choice_count integer
);
create index homebrew_background_features_background_id_idx on homebrew_background_features(background_id);

-- Visibility: same computed-hierarchy pattern as races - parents carry the
-- flag, children resolve through their parent via a security definer
-- helper so the child policy can read the parent row past its own RLS.
create or replace function public.is_homebrew_feat_visible(p_feat_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_dm() or exists (
    select 1 from homebrew_feats where id = p_feat_id and visibility = 'public'
  );
$$;

create or replace function public.is_homebrew_background_visible(p_background_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_dm() or exists (
    select 1 from homebrew_backgrounds where id = p_background_id and visibility = 'public'
  );
$$;

alter table homebrew_feats enable row level security;
create policy "homebrew feats are publicly readable" on homebrew_feats
  for select using (visibility = 'public' or is_dm());
create policy "dm manages homebrew feats" on homebrew_feats for all using (is_dm()) with check (is_dm());

alter table homebrew_feat_benefits enable row level security;
create policy "homebrew feat benefits are publicly readable" on homebrew_feat_benefits
  for select using (is_homebrew_feat_visible(feat_id));
create policy "dm manages homebrew feat benefits" on homebrew_feat_benefits for all using (is_dm()) with check (is_dm());

alter table homebrew_backgrounds enable row level security;
create policy "homebrew backgrounds are publicly readable" on homebrew_backgrounds
  for select using (visibility = 'public' or is_dm());
create policy "dm manages homebrew backgrounds" on homebrew_backgrounds for all using (is_dm()) with check (is_dm());

alter table homebrew_background_features enable row level security;
create policy "homebrew background features are publicly readable" on homebrew_background_features
  for select using (is_homebrew_background_visible(background_id));
create policy "dm manages homebrew background features" on homebrew_background_features
  for all using (is_dm()) with check (is_dm());
