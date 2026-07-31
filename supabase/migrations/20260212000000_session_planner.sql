-- Session Planner: a guided, sequential session-beat builder for the DM.
-- Deliberately a strict tree (single parent_node_id per node), not a general
-- DAG - matches how skill_trees/skillTrees.js already model a single-parent
-- hierarchy in this schema, and keeps dagre auto-layout simple (no crossing
-- edges from branches merging back together). This is DM-only prep material,
-- not player-facing, so RLS has no public select at all - unlike most of
-- this schema's public-read/DM-write split.
create table session_plans (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  name text not null,
  session_date date,
  status text not null default 'planning' check (status in ('planning', 'ready', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- answers is keyed by each node_type's stable per-question keys (e.g.
-- {"hook": "...", "goal": "..."}), not by question text or array index, so
-- editing a prompt's wording later in src/lib/sessionPlanner.js doesn't
-- orphan old answers. branch_label is only meaningful once a parent has more
-- than one child - enforced in the UI (NodeCreationForm), not here, since a
-- check constraint can't see sibling rows.
create table session_plan_nodes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references session_plans(id) on delete cascade,
  parent_node_id uuid references session_plan_nodes(id) on delete cascade,
  branch_label text not null default '',
  node_type text not null check (node_type in ('scene', 'encounter', 'npc', 'decision', 'twist', 'downtime', 'note')),
  title text not null,
  answers jsonb not null default '{}',
  referenced_entry_id uuid references entries(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_plan_nodes_plan_id_idx on session_plan_nodes(plan_id);
create index session_plan_nodes_parent_node_id_idx on session_plan_nodes(parent_node_id);

drop trigger if exists session_plans_set_updated_at on session_plans;
create trigger session_plans_set_updated_at
  before update on session_plans
  for each row execute function set_updated_at();

drop trigger if exists session_plan_nodes_set_updated_at on session_plan_nodes;
create trigger session_plan_nodes_set_updated_at
  before update on session_plan_nodes
  for each row execute function set_updated_at();

-- Adding/editing/deleting a beat doesn't otherwise touch the parent plan row
-- at all, so without this the plan list's "last updated" would only reflect
-- renames, not actual planning progress.
create or replace function public.touch_session_plan()
returns trigger
language plpgsql
as $$
begin
  update session_plans set updated_at = now() where id = coalesce(new.plan_id, old.plan_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists session_plan_nodes_touch_plan on session_plan_nodes;
create trigger session_plan_nodes_touch_plan
  after insert or update or delete on session_plan_nodes
  for each row execute function touch_session_plan();

alter table session_plans enable row level security;
create policy "dm manages session plans"
  on session_plans for all
  using (is_dm())
  with check (is_dm());

alter table session_plan_nodes enable row level security;
create policy "dm manages session plan nodes"
  on session_plan_nodes for all
  using (is_dm())
  with check (is_dm());
