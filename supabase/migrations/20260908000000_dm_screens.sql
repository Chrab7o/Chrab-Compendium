-- DM Screen: a modular, per-campaign live-session dashboard. A campaign can
-- have any number of named screens (tabs) to toggle between mid-session
-- (e.g. "Combat", "Social", "Travel"), each holding an ordered list of
-- widget instances. Mirrors session_plans/session_plan_nodes's DM-only RLS
-- (no public select at all) since this is prep/session-running material,
-- not player-facing.
create table dm_screens (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dm_screens_campaign_id_idx on dm_screens(campaign_id);

-- widget_type tags which component renders this row - see WIDGET_TYPES in
-- src/lib/dmScreen.js. config is a free-form per-type bag (session_flow
-- stores {sessionPlanId}, session_wrapup stores {text}); npc_generator and
-- reminders currently need none but keep the column for future per-widget
-- options without a migration.
create table dm_screen_widgets (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references dm_screens(id) on delete cascade,
  widget_type text not null check (widget_type in ('npc_generator', 'session_flow', 'reminders', 'session_wrapup')),
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dm_screen_widgets_screen_id_idx on dm_screen_widgets(screen_id);

create trigger dm_screens_set_updated_at before update on dm_screens
  for each row execute function set_updated_at();
create trigger dm_screen_widgets_set_updated_at before update on dm_screen_widgets
  for each row execute function set_updated_at();

alter table dm_screens enable row level security;
create policy "dm manages dm screens" on dm_screens for all using (is_dm()) with check (is_dm());

alter table dm_screen_widgets enable row level security;
create policy "dm manages dm screen widgets" on dm_screen_widgets for all using (is_dm()) with check (is_dm());

-- Freeform per-character note for quick session-time reference (e.g. "low
-- on HP", "owes the blacksmith money") - changes rarely, not reset per
-- session. not null default '' rather than nullable: the widget always
-- renders it in a controlled <textarea>, and a null value there is the
-- classic "controlled input becomes uncontrolled" React footgun - default
-- '' sidesteps it entirely. Covered by the existing "dm manages characters"
-- policy already on this table - no new RLS needed.
alter table characters add column dm_note text not null default '';
