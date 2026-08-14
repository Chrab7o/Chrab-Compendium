-- Scenes were a strict tree (one parent_node_id per node), which made it
-- impossible for two different obstacles to both lead to the same next
-- scene. Replaces that with a proper edge list (session_plan_edges),
-- letting a scene have any number of incoming AND outgoing connections -
-- what dagre already renders fine as a general DAG, not just a tree.
-- is_obstacle and sort_order move from the node to the edge, since they're
-- properties of a *connection* (the same scene could be an obstacle from
-- one path and a plain "then" from another) rather than of the scene
-- itself. Deleting a node cascades to remove its own edges (in and out) but
-- deliberately does NOT touch the nodes at the other end - "removing a
-- connection just unlinks it," per the chosen design; a node that becomes
-- unreachable as a result just sits disconnected rather than vanishing, so
-- nothing is silently destroyed by deleting one of several paths to it.
--
-- Since a plan's tree could always be reduced to nothing but orphaned nodes
-- through enough disconnects, "the root" can no longer be inferred as
-- "whichever node has no parent" - session_plans.root_node_id records the
-- one true anchor explicitly, immune to whatever the DM does to the graph
-- afterward.

create table session_plan_edges (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references session_plans(id) on delete cascade,
  from_node_id uuid not null references session_plan_nodes(id) on delete cascade,
  to_node_id uuid not null references session_plan_nodes(id) on delete cascade,
  is_obstacle boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_node_id, to_node_id)
);

create index session_plan_edges_plan_id_idx on session_plan_edges(plan_id);
create index session_plan_edges_from_node_id_idx on session_plan_edges(from_node_id);
create index session_plan_edges_to_node_id_idx on session_plan_edges(to_node_id);

create trigger session_plan_edges_set_updated_at before update on session_plan_edges
  for each row execute function set_updated_at();

alter table session_plan_edges enable row level security;
create policy "dm manages session plan edges" on session_plan_edges for all using (is_dm()) with check (is_dm());

-- Reuses the existing touch_session_plan() trigger function (already
-- generic over any table with a plan_id column) so connecting/disconnecting
-- scenes also bumps the plan's updated_at, same as editing a node does.
create trigger session_plan_edges_touch_plan
  after insert or update or delete on session_plan_edges
  for each row execute function touch_session_plan();

insert into session_plan_edges (plan_id, from_node_id, to_node_id, is_obstacle, sort_order)
select plan_id, parent_node_id, id, is_obstacle, sort_order
from session_plan_nodes
where parent_node_id is not null;

alter table session_plans add column root_node_id uuid references session_plan_nodes(id) on delete set null;

update session_plans p
set root_node_id = (
  select n.id from session_plan_nodes n
  where n.plan_id = p.id and n.parent_node_id is null
  order by n.created_at
  limit 1
);

alter table session_plan_nodes
  drop column parent_node_id,
  drop column is_obstacle,
  drop column sort_order;
