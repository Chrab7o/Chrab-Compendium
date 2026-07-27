-- Feeds the Discord "/points show-all" command (see supabase/functions/
-- discord-interactions) with one row per character+tree_type that has a
-- point pool, including spend computed the same way the RPCs and the React
-- client do (unlock costs + craft costs, summed per shared pool).
--
-- security_invoker = true means this view respects each underlying table's
-- RLS for whoever queries it - it isn't a bypass. The explicit revokes below
-- are still needed on top of that: Supabase's PostgREST layer exposes every
-- public-schema relation to REST clients by default, and this view joins
-- data a player shouldn't be able to list for every character at once (only
-- their own, per character_skill_points' own RLS) - the Edge Function reads
-- it with the service role key, which bypasses RLS and grants entirely, so
-- these revokes only affect direct access from the web app's authenticated
-- players, not the bot.
create or replace view character_skill_pool_summary
with (security_invoker = true) as
select
  c.id as character_id,
  c.name as character_name,
  csp.tree_type,
  csp.points_available,
  coalesce(unlock_spent.spent, 0) + coalesce(craft_spent.spent, 0) as points_spent
from characters c
join character_skill_points csp on csp.character_id = c.id
left join lateral (
  select sum(n.cost) as spent
  from character_skill_unlocks u
  join skill_tree_nodes n on n.id = u.node_id
  join skill_trees st on st.id = n.tree_id
  where u.character_id = c.id and st.tree_type = csp.tree_type
) unlock_spent on true
left join lateral (
  select sum(cr.cost) as spent
  from character_skill_crafts cr
  join skill_tree_nodes n on n.id = cr.node_id
  join skill_trees st on st.id = n.tree_id
  where cr.character_id = c.id and st.tree_type = csp.tree_type
) craft_spent on true;

revoke all on character_skill_pool_summary from public;
revoke all on character_skill_pool_summary from anon, authenticated;
grant select on character_skill_pool_summary to service_role;
