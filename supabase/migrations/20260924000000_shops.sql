-- Rotating shops: a DM-rolled list of magic items that players can read.
--
-- This is deliberately NOT a transactional system. Buying, haggling and
-- bartering happen at the table, in character; the app only randomises the
-- stock and displays it. So there is no gold, no quantity, no stock decrement
-- and no purchase log - removing an item a party bought is a plain delete the
-- DM does by hand.

create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Players reach a shop at /shop/<slug>, following the slug convention every
  -- other player-facing non-entry page uses (maps, worlds, homebrew classes).
  slug text not null unique,
  -- Shown above the stock list: who runs the place, how they trade, opening
  -- hours - whatever the DM wants players to read before the inventory.
  blurb text not null default '',
  campaign_id uuid references campaigns(id) on delete cascade,
  visibility text not null default 'dm'
    check (visibility in ('public', 'dm')),
  -- The roll spec: { sources: [...], counts: { uncommon: 5, ... },
  -- exclude: [pool key, ...] }. jsonb rather than columns because this shape
  -- belongs to the shop roller and will keep moving - one shop wants five of
  -- each rarity, the next might want a different mix entirely - and every
  -- change would otherwise be a migration. `exclude` is the "never stock this
  -- again" list, which earns its place precisely because a restock rerolls
  -- everything: without it, a banished item comes back on the next roll.
  spec jsonb not null default '{}',
  restocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shops_campaign_id_idx on shops(campaign_id);

-- One row per item currently on the shelf.
--
-- The description is SNAPSHOT here rather than looked up from
-- src/data/shop-items/pool.json at read time. Three reasons: the player page
-- then loads ~20 rows instead of a 284 KB pool it would otherwise have to
-- download in full; homebrew items from item_maker_items and items the DM
-- types in by hand live in the same list through the same columns; and a
-- restock is a total reroll, so a snapshot can never drift out of date.
create table shop_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  position integer not null default 0,
  name text not null,
  rarity text,
  source text,
  attunement text,
  description text not null default '',
  -- Where the row came from. '5etools' rows are replaced wholesale on every
  -- restock; 'homebrew' and 'manual' rows are the DM's deliberate additions and
  -- survive one, since a reroll is about the randomised stock, not about
  -- throwing away something that was put there on purpose.
  origin text not null default '5etools'
    check (origin in ('5etools', 'homebrew', 'manual')),
  -- The pool key ("bag-of-holding|xdmg"), so an item can be added to a shop's
  -- exclude list from its row. Null for homebrew and hand-typed items.
  item_key text,
  created_at timestamptz not null default now()
);

create index shop_items_shop_id_idx on shop_items(shop_id);

-- No price column, on purpose. The shop this was built for runs on trade, and
-- 5e prices magic items by rarity rather than individually (only 11 of 1,680
-- items in the source data carry a value at all). Adding a nullable price later
-- is a one-line migration; guessing at a pricing model now would bake in
-- assumptions about an economy that has not been designed yet.

drop trigger if exists shops_set_updated_at on shops;
create trigger shops_set_updated_at
  before update on shops
  for each row execute function set_updated_at();

-- Row Level Security -----------------------------------------------------
-- Unlike item_maker_items, which is DM-only prep material, a shop is meant to
-- be read by players - that is the whole point of it. So visibility is a real
-- gate here, enforced in the database rather than by hiding a link.

alter table shops enable row level security;
alter table shop_items enable row level security;

create policy "public shops are readable"
  on shops for select
  using (visibility = 'public' or is_dm());

create policy "dm manages shops"
  on shops for all
  using (is_dm())
  with check (is_dm());

-- Stock inherits its shop's visibility. Checking the parent here rather than
-- mirroring a visibility column onto every row keeps one source of truth, so
-- flipping a shop to public cannot leave its items behind.
create policy "public shop items are readable"
  on shop_items for select
  using (
    exists (
      select 1 from shops s
      where s.id = shop_items.shop_id
        and (s.visibility = 'public' or is_dm())
    )
  );

create policy "dm manages shop items"
  on shop_items for all
  using (is_dm())
  with check (is_dm());
