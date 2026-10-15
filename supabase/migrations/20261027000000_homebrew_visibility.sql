-- Hide work-in-progress homebrew from players. Same 'public' | 'dm'
-- visibility column categories and shops use, on the three top-level
-- homebrew entities (classes, subclasses, races). Child rows (features,
-- table columns/values, traits) carry no flag of their own - they resolve
-- through their parent at read time, the computed-hierarchy pattern. A
-- subclass is visible only if it AND its parent class (when it has one) are
-- public, so hiding a class hides everything under it in one switch.
--
-- Existing rows backfill as 'public' so nothing already published
-- disappears; the default then flips to 'dm' so anything new starts hidden
-- until the DM publishes it.

alter table homebrew_classes add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'dm'));
alter table homebrew_classes alter column visibility set default 'dm';

alter table homebrew_subclasses add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'dm'));
alter table homebrew_subclasses alter column visibility set default 'dm';

alter table homebrew_races add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'dm'));
alter table homebrew_races alter column visibility set default 'dm';

-- Security definer so the child-table policies can look at the parent row
-- without tripping the parent's own RLS (and without recursion).
create or replace function public.is_homebrew_class_visible(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_dm() or exists (
    select 1 from homebrew_classes where id = p_class_id and visibility = 'public'
  );
$$;

create or replace function public.is_homebrew_subclass_visible(p_subclass_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_dm() or exists (
    select 1 from homebrew_subclasses s
    left join homebrew_classes c on c.id = s.class_id
    where s.id = p_subclass_id
      and s.visibility = 'public'
      and (s.class_id is null or c.visibility = 'public')
  );
$$;

create or replace function public.is_homebrew_race_visible(p_race_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_dm() or exists (
    select 1 from homebrew_races where id = p_race_id and visibility = 'public'
  );
$$;

drop policy if exists "homebrew classes are publicly readable" on homebrew_classes;
create policy "homebrew classes are publicly readable" on homebrew_classes
  for select using (visibility = 'public' or is_dm());

drop policy if exists "homebrew class features are publicly readable" on homebrew_class_features;
create policy "homebrew class features are publicly readable" on homebrew_class_features
  for select using (is_homebrew_class_visible(class_id));

drop policy if exists "homebrew class table columns are publicly readable" on homebrew_class_table_columns;
create policy "homebrew class table columns are publicly readable" on homebrew_class_table_columns
  for select using (is_homebrew_class_visible(class_id));

drop policy if exists "homebrew class table values are publicly readable" on homebrew_class_table_values;
create policy "homebrew class table values are publicly readable" on homebrew_class_table_values
  for select using (
    is_dm() or exists (
      select 1 from homebrew_class_table_columns col
      where col.id = homebrew_class_table_values.column_id and is_homebrew_class_visible(col.class_id)
    )
  );

drop policy if exists "homebrew subclasses are publicly readable" on homebrew_subclasses;
create policy "homebrew subclasses are publicly readable" on homebrew_subclasses
  for select using (is_homebrew_subclass_visible(id));

drop policy if exists "homebrew subclass features are publicly readable" on homebrew_subclass_features;
create policy "homebrew subclass features are publicly readable" on homebrew_subclass_features
  for select using (is_homebrew_subclass_visible(subclass_id));

drop policy if exists "homebrew races are publicly readable" on homebrew_races;
create policy "homebrew races are publicly readable" on homebrew_races
  for select using (visibility = 'public' or is_dm());

drop policy if exists "homebrew race traits are publicly readable" on homebrew_race_traits;
create policy "homebrew race traits are publicly readable" on homebrew_race_traits
  for select using (is_homebrew_race_visible(race_id));
