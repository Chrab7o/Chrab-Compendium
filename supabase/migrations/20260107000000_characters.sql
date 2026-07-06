-- Character sheets, imported from FoundryVTT actor exports. The raw import
-- is kept verbatim in raw_data (jsonb) so the viewer can be improved later
-- without re-importing, and so nothing is lost even when the viewer only
-- surfaces a subset of it.
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references profiles(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  source text not null default 'foundry' check (source in ('foundry', 'manual')),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_owner_id_idx on characters(owner_id);
create index if not exists characters_campaign_id_idx on characters(campaign_id);

drop trigger if exists characters_set_updated_at on characters;
create trigger characters_set_updated_at
  before update on characters
  for each row execute function set_updated_at();

alter table characters enable row level security;

drop policy if exists "owner reads own character" on characters;
create policy "owner reads own character"
  on characters for select
  using (auth.uid() = owner_id or is_dm());

drop policy if exists "dm manages characters" on characters;
create policy "dm manages characters"
  on characters for all
  using (is_dm())
  with check (is_dm());
