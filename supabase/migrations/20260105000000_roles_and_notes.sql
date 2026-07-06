-- Introduces real roles (dm vs player) now that player accounts are coming.
-- Until now every policy checked `auth.role() = 'authenticated'`, which
-- treats ANY logged-in user as the DM. That stops being safe the moment a
-- player account exists, so this migration adds a profiles table + an
-- is_dm() check and rewrites every existing policy to use it.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('dm', 'player')),
  display_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Auto-create a profile row for every new auth user. New accounts default
-- to 'player' — you (the DM) flip your own account to 'dm' below, and any
-- future DM-equivalent account would need the same manual flip.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, 'player', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: at the time this runs, the only account that should exist is
-- your own DM login, so anyone not yet in `profiles` gets marked 'dm'.
-- If you've already created player accounts before running this, go flip
-- their role back to 'player' in the Table Editor afterward (Table Editor
-- → profiles → change that row's role).
insert into profiles (id, role, display_name)
select id, 'dm', email from auth.users
on conflict (id) do nothing;

-- Central role check other policies delegate to. security definer so it
-- can read `profiles` regardless of the caller's own row-level access.
create or replace function public.is_dm()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'dm'
  );
$$;

drop policy if exists "users read own profile" on profiles;
create policy "users read own profile"
  on profiles for select
  using (auth.uid() = id or is_dm());

drop policy if exists "dm manages profiles" on profiles;
create policy "dm manages profiles"
  on profiles for update
  using (is_dm())
  with check (is_dm());

-- Rewrite existing policies to use is_dm() instead of "any logged-in user".
drop policy if exists "dm manages campaigns" on campaigns;
create policy "dm manages campaigns"
  on campaigns for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "public entries are publicly readable" on entries;
create policy "public entries are publicly readable"
  on entries for select
  using (visibility = 'public' or is_dm());

drop policy if exists "dm manages entries" on entries;
create policy "dm manages entries"
  on entries for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "dm manages maps" on maps;
create policy "dm manages maps"
  on maps for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "public markers are publicly readable" on map_markers;
create policy "public markers are publicly readable"
  on map_markers for select
  using (visibility = 'public' or is_dm());

drop policy if exists "dm manages markers" on map_markers;
create policy "dm manages markers"
  on map_markers for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "dm manages map images" on storage.objects;
create policy "dm manages map images"
  on storage.objects for all
  using (bucket_id = 'maps' and is_dm())
  with check (bucket_id = 'maps' and is_dm());

-- Player private notes. Owners manage their own; the DM can read (but not
-- edit/delete) everyone's, per your call that notes stay DM-visible.
create table if not exists player_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_notes_owner_id_idx on player_notes(owner_id);

drop trigger if exists player_notes_set_updated_at on player_notes;
create trigger player_notes_set_updated_at
  before update on player_notes
  for each row execute function set_updated_at();

alter table player_notes enable row level security;

drop policy if exists "owners manage own notes" on player_notes;
create policy "owners manage own notes"
  on player_notes for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "dm reads all notes" on player_notes;
create policy "dm reads all notes"
  on player_notes for select
  using (is_dm());
