-- Gold in Discord.
--
-- 1. Every trade message now ends with the character's balance after the
--    trade ("— Mava now has 3,285 gp"), from character_balance_gp() - the
--    same figure the shop page shows (imported gold plus trades not yet
--    applied in Foundry).
-- 2. party_gold() feeds the bot's /gold command (supabase/functions/
--    discord-interactions). Like character_skill_pool_summary it is for the
--    bot only: the bot calls it with the service role, and nobody else can
--    execute it - otherwise any player could read everyone's purse.

-- 1234.5 -> '1,234.5'; 1230 -> '1,230'. Rounded to the copper.
create or replace function public.format_gp(p_gp numeric)
returns text
language sql
immutable
as $$
  select rtrim(rtrim(to_char(round(coalesce(p_gp, 0), 2), 'FM999,999,999,990.99'), '0'), '.')
$$;

create or replace function public.party_gold()
returns table (
  character_name text,
  campaign_name text,
  imported_gp numeric,
  pending_trades integer,
  balance_gp numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.name,
    cp.name,
    currency_to_gp(c.currency),
    (select count(*)::integer from shop_transactions t where t.character_id = c.id and t.settled_at is null),
    character_balance_gp(c.id)
  from characters c
  left join campaigns cp on cp.id = c.campaign_id
  where c.owner_id is not null
  order by cp.name nulls last, c.name
$$;

revoke execute on function public.party_gold() from public, anon, authenticated;
grant execute on function public.party_gold() to service_role;
grant execute on function public.format_gp(numeric) to authenticated;

-- A player (or the DM) buys from a store.
create or replace function public.shop_buy(p_character_id uuid, p_shop_item_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_character_name text;
  v_item shop_items%rowtype;
  v_shop shops%rowtype;
  v_total numeric;
  v_balance numeric;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  -- Row lock on the character serialises this character's trades, so two
  -- quick clicks can't both pass the balance check.
  select owner_id, name into v_owner, v_character_name
  from characters where id = p_character_id for update;
  if v_owner is null or (v_owner <> auth.uid() and not is_dm()) then
    raise exception 'not your character';
  end if;

  select * into v_item from shop_items where id = p_shop_item_id for update;
  if v_item.id is null then
    raise exception 'that item is no longer on the shelf';
  end if;
  select * into v_shop from shops where id = v_item.shop_id for update;

  if v_shop.kind <> 'store' then
    raise exception 'this shop trades at the table, not on the page';
  end if;
  if not is_dm() and (v_shop.visibility <> 'public' or not v_shop.is_open) then
    raise exception 'this shop is closed';
  end if;
  if not is_dm() and v_shop.campaign_id is not null
     and v_shop.campaign_id is distinct from (select campaign_id from characters where id = p_character_id) then
    raise exception 'that character is in a different campaign';
  end if;
  if v_item.price_gp is null then
    raise exception 'that item has no price';
  end if;
  if v_item.quantity is not null and v_item.quantity < p_quantity then
    raise exception 'only % left', v_item.quantity;
  end if;

  v_total := v_item.price_gp * p_quantity;
  v_balance := character_balance_gp(p_character_id);
  if v_total > v_balance then
    raise exception 'not enough gold (costs % gp, you have % gp)', v_total, round(v_balance, 2);
  end if;

  if v_item.quantity is not null then
    update shop_items set quantity = quantity - p_quantity where id = v_item.id;
  end if;

  insert into shop_transactions
    (shop_id, character_id, kind, shop_name, item_name, shop_item_id, quantity, total_gp, recorded_by)
  values
    (v_shop.id, p_character_id, 'buy', v_shop.name, v_item.name, v_item.id, p_quantity, v_total, auth.uid());

  -- What players spend goes into the shop's purse.
  if v_shop.coin_gp is not null then
    update shops set coin_gp = coin_gp + v_total where id = v_shop.id;
  end if;

  perform notify_discord(format(
    '🛒 **%s** bought %s**%s** for %s gp at %s — %s now has %s gp',
    v_character_name,
    case when p_quantity > 1 then p_quantity || '× ' else '' end,
    v_item.name, format_gp(v_total), v_shop.name,
    v_character_name, format_gp(character_balance_gp(p_character_id))
  ));
end;
$$;


-- A player (or the DM) sells an item from their imported Foundry inventory to
-- a store. The price never comes from the caller.
create or replace function public.shop_sell(
  p_character_id uuid, p_shop_id uuid, p_foundry_item_id text, p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_character_name text;
  v_raw jsonb;
  v_shop shops%rowtype;
  v_item jsonb;
  v_owned integer;
  v_pending integer;
  v_unit_gp numeric;
  v_total numeric;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  select owner_id, name, raw_data into v_owner, v_character_name, v_raw
  from characters where id = p_character_id for update;
  if v_owner is null or (v_owner <> auth.uid() and not is_dm()) then
    raise exception 'not your character';
  end if;

  -- Locked: the purse check below must not race another sale.
  select * into v_shop from shops where id = p_shop_id for update;
  if v_shop.id is null or v_shop.kind <> 'store' then
    raise exception 'this shop does not buy on the page';
  end if;
  if not is_dm() and (v_shop.visibility <> 'public' or not v_shop.is_open) then
    raise exception 'this shop is closed';
  end if;
  if not is_dm() and v_shop.campaign_id is not null
     and v_shop.campaign_id is distinct from (select campaign_id from characters where id = p_character_id) then
    raise exception 'that character is in a different campaign';
  end if;

  select e.value into v_item
  from jsonb_array_elements(coalesce(v_raw->'items', '[]'::jsonb)) as e(value)
  where e.value->>'_id' = p_foundry_item_id
    and e.value->>'type' in ('weapon', 'equipment', 'consumable', 'tool', 'loot', 'container')
  limit 1;
  if v_item is null then
    raise exception 'that item is not in your inventory';
  end if;

  v_owned := coalesce((v_item->'system'->>'quantity')::integer, 1);
  select coalesce(sum(quantity), 0) into v_pending
  from shop_transactions
  where character_id = p_character_id and foundry_item_id = p_foundry_item_id
    and kind = 'sell' and settled_at is null;
  if p_quantity > v_owned - v_pending then
    raise exception 'you only have % to sell', greatest(v_owned - v_pending, 0);
  end if;

  -- Value is the item's own Foundry price. When that's 0 (potions and
  -- homebrew often are), fall back to what this shop lists an item of the
  -- same name for.
  v_unit_gp := coalesce((v_item->'system'->'price'->>'value')::numeric, 0)
    * case coalesce(v_item->'system'->'price'->>'denomination', 'gp')
        when 'pp' then 10 when 'ep' then 0.5 when 'sp' then 0.1 when 'cp' then 0.01 else 1
      end;
  if v_unit_gp <= 0 then
    select coalesce(max(price_gp), 0) into v_unit_gp
    from shop_items
    where shop_id = p_shop_id and lower(name) = lower(v_item->>'name');
  end if;
  if v_unit_gp <= 0 then
    raise exception 'that item has no value to sell';
  end if;
  -- The store's rate, set by the DM; rounded down to the copper.
  v_total := floor(v_unit_gp * v_shop.sell_rate * p_quantity * 100) / 100;

  if v_shop.coin_gp is not null and v_total > v_shop.coin_gp then
    raise exception '% only has % gp on hand', v_shop.name, trim_scale(v_shop.coin_gp);
  end if;
  if v_shop.coin_gp is not null then
    update shops set coin_gp = coin_gp - v_total where id = v_shop.id;
  end if;

  insert into shop_transactions
    (shop_id, character_id, kind, shop_name, item_name, foundry_item_id, quantity, total_gp, recorded_by)
  values
    (v_shop.id, p_character_id, 'sell', v_shop.name, v_item->>'name', p_foundry_item_id, p_quantity, v_total, auth.uid());

  perform notify_discord(format(
    '💰 **%s** sold %s**%s** for %s gp at %s — %s now has %s gp',
    v_character_name,
    case when p_quantity > 1 then p_quantity || '× ' else '' end,
    v_item->>'name', format_gp(v_total), v_shop.name,
    v_character_name, format_gp(character_balance_gp(p_character_id))
  ));
end;
$$;


-- The DM logs a trade made at the table (exchange shops, or anything else
-- off-page). Free-form: no stock or balance checks, the DM is the authority.
create or replace function public.shop_record_trade(
  p_character_id uuid, p_shop_id uuid, p_kind text, p_item_name text,
  p_quantity integer, p_total_gp numeric, p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character_name text;
  v_shop_name text;
begin
  if not is_dm() then
    raise exception 'only the DM can record trades';
  end if;
  select name into v_character_name from characters where id = p_character_id;
  select name into v_shop_name from shops where id = p_shop_id;
  if v_character_name is null or v_shop_name is null then
    raise exception 'character or shop not found';
  end if;

  insert into shop_transactions
    (shop_id, character_id, kind, shop_name, item_name, quantity, total_gp, note, recorded_by)
  values
    (p_shop_id, p_character_id, p_kind, v_shop_name, p_item_name, p_quantity, p_total_gp,
     coalesce(p_note, ''), auth.uid());

  -- The DM is the authority here, so no purse check - just keep the purse
  -- in step, never below empty.
  update shops
  set coin_gp = greatest(0, coin_gp + case when p_kind = 'buy' then p_total_gp else -p_total_gp end)
  where id = p_shop_id and coin_gp is not null;

  perform notify_discord(format(
    '%s **%s** %s %s**%s** for %s gp at %s%s — %s now has %s gp',
    case when p_kind = 'buy' then '🛒' else '💰' end,
    v_character_name,
    case when p_kind = 'buy' then 'bought' else 'sold' end,
    case when p_quantity > 1 then p_quantity || '× ' else '' end,
    p_item_name, format_gp(p_total_gp), v_shop_name,
    case when coalesce(p_note, '') <> '' then ' (' || p_note || ')' else '' end,
    v_character_name, format_gp(character_balance_gp(p_character_id))
  ));
end;
$$;


-- The DM reverses a trade: deletes it and puts bought stock back on the shelf.
create or replace function public.shop_undo_trade(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx shop_transactions%rowtype;
  v_character_name text;
begin
  if not is_dm() then
    raise exception 'only the DM can undo trades';
  end if;
  select * into v_tx from shop_transactions where id = p_transaction_id;
  if v_tx.id is null then
    raise exception 'trade not found';
  end if;

  if v_tx.kind = 'buy' and v_tx.shop_item_id is not null then
    update shop_items set quantity = quantity + v_tx.quantity
    where id = v_tx.shop_item_id and quantity is not null;
  end if;
  -- Reverse the purse movement: an undone purchase leaves the purse, an
  -- undone sale comes back to it.
  update shops
  set coin_gp = greatest(0, coin_gp + case when v_tx.kind = 'buy' then -v_tx.total_gp else v_tx.total_gp end)
  where id = v_tx.shop_id and coin_gp is not null;
  delete from shop_transactions where id = v_tx.id;

  select name into v_character_name from characters where id = v_tx.character_id;
  perform notify_discord(format(
    '↩️ Undone: **%s** %s **%s** at %s — %s now has %s gp',
    v_character_name,
    case when v_tx.kind = 'buy' then 'buying' else 'selling' end,
    v_tx.item_name, v_tx.shop_name,
    v_character_name, format_gp(character_balance_gp(v_tx.character_id))
  ));
end;
$$;

-- Grants carry over: create or replace keeps them.
