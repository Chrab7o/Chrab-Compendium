-- Prefab content types, layered on top of the existing question/answer tree
-- rather than replacing it: a node can now be tagged as a Location, Event,
-- Travel procedure, Obstacle/encounter, or freeform Note, in addition to
-- the default plain Question. This only changes what the question/answer
-- columns are LABELED as in the UI (e.g. a Location node's "question" holds
-- its name, "answer" holds its description) - no new columns beyond the
-- type tag itself, keeping every existing row (all currently type
-- 'question') valid as-is. The tree/obstacle/branch mechanics are
-- completely unaffected - a Location node can have Obstacle/Event/Travel
-- children exactly like a Question node can.
alter table session_plan_nodes
  add column content_type text not null default 'question'
    check (content_type in ('question', 'location', 'event', 'travel', 'obstacle', 'note'));
