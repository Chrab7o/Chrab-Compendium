-- Not every step forward is an obstacle - sometimes the answer to a
-- question just leads straight to the next thing that happens, with
-- nothing standing in the way. Adds is_obstacle so a child question can be
-- flagged as either "an obstacle to the answer" (the original mechanic,
-- default true - accurate for every existing child node, since that was
-- the only way to spawn one until now) or a plain "then" continuation with
-- no complication attached. Purely a labeling/rendering distinction - the
-- question/answer/parent_node_id mechanics are unchanged.
alter table session_plan_nodes
  add column is_obstacle boolean not null default true;
