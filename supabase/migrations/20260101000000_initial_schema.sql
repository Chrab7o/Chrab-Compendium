-- Chrab Corner schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  category text not null default 'lore'
    check (category in ('lore', 'npc', 'location', 'session-note', 'homebrew', 'item')),
  visibility text not null default 'public'
    check (visibility in ('public', 'dm')),
  campaign_id uuid references campaigns(id) on delete cascade,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entries_campaign_id_idx on entries(campaign_id);
create index if not exists entries_visibility_idx on entries(visibility);
create index if not exists entries_category_idx on entries(category);

-- Keep updated_at current on every edit.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists entries_set_updated_at on entries;
create trigger entries_set_updated_at
  before update on entries
  for each row execute function set_updated_at();

-- Row Level Security -----------------------------------------------------
-- Anyone (anon key, no login) can read campaigns and public entries.
-- Only a logged-in user (you, the DM) can read DM-only entries or write anything.

alter table campaigns enable row level security;
alter table entries enable row level security;

drop policy if exists "campaigns are publicly readable" on campaigns;
create policy "campaigns are publicly readable"
  on campaigns for select
  using (true);

drop policy if exists "dm manages campaigns" on campaigns;
create policy "dm manages campaigns"
  on campaigns for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "public entries are publicly readable" on entries;
create policy "public entries are publicly readable"
  on entries for select
  using (visibility = 'public' or auth.role() = 'authenticated');

drop policy if exists "dm manages entries" on entries;
create policy "dm manages entries"
  on entries for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- After running this file: go to Authentication > Users in the Supabase
-- dashboard and manually create one user (your DM login email/password).
-- Do not enable public sign-ups; this site only ever needs one DM account.
