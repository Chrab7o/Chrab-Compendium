-- Chrab Sync pushes player character sheets from Foundry into characters,
-- replacing the party-export macro + manual import for characters that are
-- already on the site. See docs/npc-forge-phase2.md ("Character sync").
--
-- Same model as 20261030000000_foundry_sync.sql: the sync role gets no table
-- policies, only these security-definer RPCs. Widened blast radius if its
-- session leaked: existing characters' sheets and gold could be overwritten
-- (never created, deleted, renamed or reassigned), and pending trades read
-- and marked settled.
--
-- Matching is by Foundry actor id only (characters.foundry_id). New
-- characters, and old rows without an id, still go through the site's
-- importer once - after that they sync automatically.

-- Overwrites the sheet + gold of every character row carrying this actor's
-- id. Returns 'updated', 'unchanged' (already identical) or 'unmatched'.
--
-- Settling is separate from pushing on purpose: an automatic push can't know
-- whether pending trades were applied in Foundry yet. The module passes
-- p_settle_trade_ids only when the DM says those exact trades are applied,
-- and only trades belonging to this actor's character are touched.
create or replace function public.sync_push_character(
  p_actor jsonb,
  p_settle_trade_ids uuid[] default '{}'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := p_actor->>'_id';
  touched integer;
begin
  if not (is_sync() or is_dm()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_id is null or p_actor->>'type' is distinct from 'character' then
    raise exception 'not a Foundry character actor';
  end if;

  update characters c
    set raw_data = p_actor,
        currency = coalesce(p_actor->'system'->'currency', '{}'::jsonb)
    where c.foundry_id = v_id
      and c.raw_data is distinct from p_actor;
  get diagnostics touched = row_count;

  if coalesce(array_length(p_settle_trade_ids, 1), 0) > 0 then
    update shop_transactions t
      set settled_at = now()
      where t.id = any(p_settle_trade_ids)
        and t.settled_at is null
        and t.character_id in (select c.id from characters c where c.foundry_id = v_id);
  end if;

  if touched > 0 then
    return 'updated';
  elsif exists (select 1 from characters c where c.foundry_id = v_id) then
    return 'unchanged';
  end if;
  return 'unmatched';
end;
$$;

-- Unsettled trades for characters linked to a Foundry actor, so the DM can
-- apply them in Foundry and then settle them from the module.
create or replace function public.sync_pending_trades()
returns table (
  trade_id uuid,
  actor_id text,
  character_name text,
  kind text,
  item_name text,
  quantity integer,
  total_gp numeric,
  shop_name text,
  note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (is_sync() or is_dm()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select t.id, c.foundry_id, c.name, t.kind, t.item_name, t.quantity, t.total_gp, t.shop_name, t.note, t.created_at
    from shop_transactions t
    join characters c on c.id = t.character_id
    where t.settled_at is null
      and c.foundry_id is not null
    order by c.name, t.created_at;
end;
$$;

revoke execute on function public.sync_push_character(jsonb, uuid[]) from public, anon;
revoke execute on function public.sync_pending_trades() from public, anon;
grant execute on function public.sync_push_character(jsonb, uuid[]) to authenticated;
grant execute on function public.sync_pending_trades() to authenticated;
