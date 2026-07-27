-- is_skill_tree_visible() (20260117000000) grants access to a restricted
-- tree if the caller owns ANY character listed in skill_tree_visible_to for
-- that tree, or if the caller is_dm(). Neither check is scoped to the
-- specific character whose sheet is actually on screen:
--   - A player who owns two characters, where a tree is granted to only one
--     of them, sees that tree on BOTH characters' pages, not just the one
--     it was assigned to.
--   - A DM using "view as" impersonation (ImpersonationContext - a client-
--     side-only convenience, not a real auth switch) is still is_dm() as
--     far as RLS is concerned, so the preview shows every tree in the
--     campaign regardless of skill_tree_visible_to, defeating the point of
--     previewing what that specific character sees.
-- This function scopes visibility to the exact character_id being viewed
-- instead of the caller's identity, while still gating who may call it for
-- a given character (its own owner, or the DM) so a player can't probe
-- another player's character by guessing an id.
create or replace function public.visible_skill_trees(p_character_id uuid)
returns setof skill_trees
language sql
security definer
set search_path = public
stable
as $$
  select st.*
  from skill_trees st
  where exists (
    select 1 from characters c
    where c.id = p_character_id
    and (c.owner_id = auth.uid() or is_dm())
  )
  and (
    not exists (select 1 from skill_tree_visible_to v where v.tree_id = st.id)
    or exists (
      select 1 from skill_tree_visible_to v
      where v.tree_id = st.id and v.character_id = p_character_id
    )
  );
$$;

grant execute on function public.visible_skill_trees(uuid) to authenticated;
