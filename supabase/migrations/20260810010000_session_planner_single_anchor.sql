-- Collapse the "3 fixed anchor roots" structure down to a single anchor
-- question ("Where are they?") - per the DM's own experience actually using
-- it, "Where are they going?" and "How do they get there?" turned out to be
-- redundant, since the obstacle chain from a single starting point already
-- traces the path to wherever the party ends up.
--
-- Only touches plans whose root set is still exactly the old 3 anchor
-- questions (i.e. plans created before this change and never edited down).
-- Plans from the original typed-beat model (a single pre-existing root with
-- unrelated text, backfilled by the prior migration) are untouched. Whichever
-- of the 3 already has real content (an answer, or a spawned obstacle child)
-- is kept and renamed; the other two (expected to be empty, since the old
-- form only ever let you fill in "Where do they start?" first) are deleted.

with old_anchor_roots as (
  select n.id, n.plan_id, n.answer, n.sort_order,
         exists (select 1 from session_plan_nodes c where c.parent_node_id = n.id) as has_children
  from session_plan_nodes n
  where n.parent_node_id is null
    and n.question in ('Where do they start?', 'Where are they going?', 'How do they get there?')
),
qualifying_plans as (
  select plan_id from old_anchor_roots group by plan_id having count(*) = 3
),
ranked as (
  select o.id, o.plan_id,
         row_number() over (
           partition by o.plan_id
           order by (o.answer is not null or o.has_children) desc, o.sort_order
         ) as rn
  from old_anchor_roots o
  join qualifying_plans q on q.plan_id = o.plan_id
),
deleted as (
  delete from session_plan_nodes
  where id in (select id from ranked where rn > 1)
  returning id
)
update session_plan_nodes
set question = 'Where are they?', sort_order = 0
where id in (select id from ranked where rn = 1);
