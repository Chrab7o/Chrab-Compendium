-- Item Description Maker saves used to live in localStorage, so a DM's items
-- only existed on the browser that made them. This is the shared home for
-- them.
--
-- `id` is text, not uuid, because the embedded tool mints its own ids
-- ("item_1699999999999") and hands them back on every save - keeping its
-- format means the tool's records round-trip without a translation layer,
-- and localStorage items already on a device keep their identity when they
-- get uploaded the first time.
--
-- `item` is the tool's own item shape (name + blocks), stored whole rather
-- than shredded into columns: that shape belongs to the item-description-maker
-- project, not to this schema, and mirroring its fields here would mean a
-- migration every time that tool adds a block type.
create table item_maker_items (
  id text primary key,
  name text not null default 'Untitled',
  item jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists item_maker_items_set_updated_at on item_maker_items;
create trigger item_maker_items_set_updated_at
  before update on item_maker_items
  for each row execute function set_updated_at();

-- DM-only, like session_plans and long_term_plans: these are prep material,
-- and the finished HTML gets pasted into a public entry when it's ready.
alter table item_maker_items enable row level security;
create policy "dm manages item maker items"
  on item_maker_items for all
  using (is_dm())
  with check (is_dm());
