-- A subclass for a class this app doesn't otherwise track (e.g. a Monk
-- monastic tradition, when there's no homebrew "Monk" class entry) needs
-- somewhere to live without a parent homebrew_classes row. class_id becomes
-- optional; parent_class_name is a plain-text label used only when class_id
-- is null (e.g. "Monk"). The two are mutually exclusive by convention (each
-- editor only ever sets one), not a DB constraint - matches this schema's
-- general preference for app-level shape enforcement over exotic checks.
alter table homebrew_subclasses alter column class_id drop not null;
alter table homebrew_subclasses add column if not exists parent_class_name text not null default '';
alter table homebrew_subclasses add column if not exists slug text unique;
alter table homebrew_subclasses add column if not exists campaign_id uuid references campaigns(id) on delete cascade;
