-- DM pages: self-contained HTML pages published from the lab (reference
-- sheets, name lists, explainers, generated tools) and shown at
-- /dm/pages/<slug>.
--
-- The lab's scripts/site-page.mjs writes them, signed in as the DM; nothing
-- here needs a deploy to add or change a page. The site shows each one in a
-- sandboxed iframe with an opaque origin, so a page's own scripts run but can
-- never reach the site's session, storage or Supabase client.
--
-- Run via `npx supabase db push --linked`.

create table if not exists dm_pages (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text not null default '',
  html text not null,
  updated_at timestamptz not null default now()
);

alter table dm_pages enable row level security;

drop policy if exists "dm manages dm pages" on dm_pages;
create policy "dm manages dm pages"
  on dm_pages for all
  using (is_dm())
  with check (is_dm());
