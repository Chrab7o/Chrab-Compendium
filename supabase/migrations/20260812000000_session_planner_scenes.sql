-- Every node is really a scene: at minimum it has a location, characters,
-- and a purpose, regardless of what kind of scene it is. Adds those three
-- as universal optional fields on every node (nobody's forced to fill them
-- in - Note/Question scenes especially may not need them). Also replaces
-- the prefab content_type list from the previous round (location/event/
-- travel/obstacle/note) with a scene-type list (encounter/conversation/
-- puzzle/decision/downtime), keeping travel/note/question alongside them -
-- Location is no longer its own type now that it's a universal field, and
-- Obstacle was never really a scene *type* distinct from is_obstacle (the
-- existing edge flag already captures "this blocks the next scene"), so it
-- isn't carried forward as a type either. Safe to change outright: every
-- existing row is still content_type='question' (verified - nothing has
-- adopted the previous round's types yet), so no data mapping is needed.
alter table session_plan_nodes
  add column location text,
  add column characters text,
  add column purpose text;

alter table session_plan_nodes drop constraint session_plan_nodes_content_type_check;
alter table session_plan_nodes
  add constraint session_plan_nodes_content_type_check
    check (content_type in ('question', 'encounter', 'conversation', 'puzzle', 'decision', 'downtime', 'travel', 'note'));
