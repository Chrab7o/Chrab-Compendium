-- Item Forge gear: the Feature Forge became the Item Forge, the item library
-- that also replaces the Item Maker. Magic items, weapons, armor and
-- consumables are drafts of kind 'gear' (lib/foundryFeatures.js), built as
-- dnd5e weapon / equipment / consumable items. See docs/feature-forge-guided.md.
--
-- Only the kind check changes: queueing, RLS and the sync RPCs are the same
-- for every kind. Chrab Sync's Items tab accepts the new item types in the
-- same deploy.
alter table feature_drafts drop constraint if exists feature_drafts_kind_check;
alter table feature_drafts add constraint feature_drafts_kind_check check (kind in ('feat', 'spell', 'gear'));
