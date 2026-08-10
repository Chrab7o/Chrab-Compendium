-- Session Planner rework: question-driven model. Every node is a question
-- with an optional answer; obstacles named in an answer become child
-- question nodes verbatim, replacing the old node_type/title/answers(jsonb)/
-- branch_label shape. Every plan now has exactly 3 fixed anchor roots
-- ("Where do they start?", "Where are they going?", "How do they get
-- there?") instead of a DM-chosen first beat - see ANCHOR_QUESTIONS in
-- src/lib/sessionPlanner.js, which is the source of truth for the client-
-- side creation path; this migration hardcodes the same 3 strings for the
-- one-time backfill below.

alter table session_plan_nodes
  add column question text,
  add column answer text;

-- Best-effort backfill for any rows created before this rework (e.g. from
-- the temp-test-route verification pass done when the original feature
-- shipped) - title becomes the question, and any per-type guided answers
-- already recorded in the answers jsonb are folded into one text blob
-- rather than silently discarded.
update session_plan_nodes
set question = title,
    answer = nullif(
      (select string_agg(value, E'\n\n') from jsonb_each_text(answers) where value <> ''),
      ''
    );

alter table session_plan_nodes alter column question set not null;

alter table session_plan_nodes
  drop column title,
  drop column node_type,
  drop column answers,
  drop column branch_label;

-- Backfill the 3 fixed anchor roots onto any plan that doesn't already have
-- at least one root node. Runs after the column drop above so the inserted
-- rows only need to satisfy the new shape.
insert into session_plan_nodes (plan_id, parent_node_id, question, answer, sort_order)
select p.id, null, v.question, null, v.sort_order
from session_plans p
cross join (values
  ('Where do they start?', 0),
  ('Where are they going?', 1),
  ('How do they get there?', 2)
) as v(question, sort_order)
where not exists (
  select 1 from session_plan_nodes n
  where n.plan_id = p.id and n.parent_node_id is null
);
