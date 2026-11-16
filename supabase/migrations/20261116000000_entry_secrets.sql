-- Entry secrets: a DM-only side to any entry, public or not.
--
-- An entry's `content` is what players read. Its secret is extra text only the
-- DM sees, shown under the content on the entry page and edited next to it in
-- the entry editor and the sphere grid. That differs from a DM-only entry
-- (visibility = 'dm'), which hides the whole entry.
--
-- The secret lives in its own table instead of a column on `entries`, because
-- RLS works on rows, not columns: a player who can read a public entry's row
-- could read any column on it through the API. Here the whole table is the DM's,
-- so a secret can't reach a player however the entry is fetched.
--
-- One secret per entry; an entry without one has no row. Deleting the entry
-- deletes its secret.
--
-- Run via `npx supabase db push`.

create table if not exists entry_secrets (
  entry_id uuid primary key references entries(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

alter table entry_secrets enable row level security;

drop policy if exists "dm manages entry secrets" on entry_secrets;
create policy "dm manages entry secrets"
  on entry_secrets for all
  using (is_dm())
  with check (is_dm());
