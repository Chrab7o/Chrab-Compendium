-- Structured homebrew Classes + Subclasses: a DM-authored, step-by-step
-- alternative to the freeform "Homebrew" entries category for D&D
-- character-option content. Field names lean toward 5etools/Foundry
-- terminology (hit_die, primary_ability, spellcasting_progression,
-- classFeatures-shaped child rows) so a future export to either format stays
-- a mapping exercise rather than a redesign — no exporter exists yet.
create table homebrew_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  hit_die integer not null default 8 check (hit_die in (4, 6, 8, 10, 12)),
  primary_ability text not null default '',
  saving_throw_proficiencies text[] not null default '{}',
  armor_proficiencies text not null default '',
  weapon_proficiencies text not null default '',
  tool_proficiencies text not null default '',
  skill_choices_count integer not null default 2,
  skill_choices_options text[] not null default '{}',
  starting_equipment text not null default '',
  spellcasting_ability text,
  spellcasting_progression text not null default 'none'
    check (spellcasting_progression in ('none', 'full', 'half', 'third', 'pact')),
  subclass_label text not null default 'Subclass',
  subclass_levels integer[] not null default '{3}',
  campaign_id uuid references campaigns(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table homebrew_class_features (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references homebrew_classes(id) on delete cascade,
  level integer not null check (level between 1 and 20),
  name text not null,
  description text not null default '',
  sort_order integer not null default 0
);
create index homebrew_class_features_class_id_idx on homebrew_class_features(class_id);

-- Optional per-class extra table columns (Sneak Attack dice, Rages, Ki
-- Points, ...) - sparse by design, a class with none has zero rows in
-- either table. Maps toward 5etools' classTableGroups / Foundry's
-- ScaleValueAdvancement.
create table homebrew_class_table_columns (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references homebrew_classes(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);
create index homebrew_class_table_columns_class_id_idx on homebrew_class_table_columns(class_id);

create table homebrew_class_table_values (
  column_id uuid not null references homebrew_class_table_columns(id) on delete cascade,
  level integer not null check (level between 1 and 20),
  value text not null default '',
  primary key (column_id, level)
);

-- Which levels grant a subclass feature is defined once on the parent class
-- (subclass_levels above, e.g. {3,6,10,14}) since it varies by class -
-- subclasses just fill in features at whichever of those levels apply.
create table homebrew_subclasses (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references homebrew_classes(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);
create index homebrew_subclasses_class_id_idx on homebrew_subclasses(class_id);

create table homebrew_subclass_features (
  id uuid primary key default gen_random_uuid(),
  subclass_id uuid not null references homebrew_subclasses(id) on delete cascade,
  level integer not null check (level between 1 and 20),
  name text not null,
  description text not null default '',
  sort_order integer not null default 0
);
create index homebrew_subclass_features_subclass_id_idx on homebrew_subclass_features(subclass_id);

-- Row Level Security ------------------------------------------------------
-- Reference content, not per-character secret state (unlike skill points) -
-- same public-read / DM-write split as skill_trees, no security-definer
-- functions needed.

alter table homebrew_classes enable row level security;
create policy "homebrew classes are publicly readable" on homebrew_classes for select using (true);
create policy "dm manages homebrew classes" on homebrew_classes for all using (is_dm()) with check (is_dm());

alter table homebrew_class_features enable row level security;
create policy "homebrew class features are publicly readable" on homebrew_class_features for select using (true);
create policy "dm manages homebrew class features" on homebrew_class_features for all using (is_dm()) with check (is_dm());

alter table homebrew_class_table_columns enable row level security;
create policy "homebrew class table columns are publicly readable" on homebrew_class_table_columns for select using (true);
create policy "dm manages homebrew class table columns" on homebrew_class_table_columns for all using (is_dm()) with check (is_dm());

alter table homebrew_class_table_values enable row level security;
create policy "homebrew class table values are publicly readable" on homebrew_class_table_values for select using (true);
create policy "dm manages homebrew class table values" on homebrew_class_table_values for all using (is_dm()) with check (is_dm());

alter table homebrew_subclasses enable row level security;
create policy "homebrew subclasses are publicly readable" on homebrew_subclasses for select using (true);
create policy "dm manages homebrew subclasses" on homebrew_subclasses for all using (is_dm()) with check (is_dm());

alter table homebrew_subclass_features enable row level security;
create policy "homebrew subclass features are publicly readable" on homebrew_subclass_features for select using (true);
create policy "dm manages homebrew subclass features" on homebrew_subclass_features for all using (is_dm()) with check (is_dm());
