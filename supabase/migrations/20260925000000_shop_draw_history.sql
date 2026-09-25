-- Make a shop's restocks mutually exclusive within each rarity.
--
-- A plain random roll can hand the party the same Cloak of Elvenkind three
-- restocks running, which makes a rotating shop feel like it isn't rotating.
-- Instead each rarity behaves like a shuffled deck: an item that comes up is
-- set aside and cannot be drawn again until every other item of that rarity
-- has been dealt, at which point the deck reshuffles.
--
-- `draw_history` is the discard pile - { "uncommon": [item_key, ...], ... }.
-- It lives in its own column rather than inside `spec` because spec is the
-- DM's configuration (what the shop is allowed to stock) while this is
-- machine-kept state (what it happens to have stocked so far). Resetting the
-- cycle should not touch the configuration, and editing the configuration
-- should not silently reshuffle the deck.
alter table shops add column if not exists draw_history jsonb not null default '{}';

comment on column shops.draw_history is
  'Per-rarity discard pile of already-drawn pool keys; cleared for a rarity when its deck is exhausted.';
