-- Two changes to selling, after 20261019000000_tradeable_shops.sql:
--
-- 1. The sell rate is per store again (it was briefly fixed at half). Default
--    is still half; the DM sets it per shop. Players can't change it -
--    haggling happens at the table.
-- 2. An item's value is its Foundry price first. Only when Foundry has it at
--    0 gp (common for potions and homebrew) does the shop's own listed price
--    for an item of the same name stand in.

alter table shops
  add column sell_rate numeric not null default 0.5 check (sell_rate >= 0 and sell_rate <= 1);

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

  select * into v_shop from shops where id = p_shop_id;
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

  insert into shop_transactions
    (shop_id, character_id, kind, shop_name, item_name, foundry_item_id, quantity, total_gp, recorded_by)
  values
    (v_shop.id, p_character_id, 'sell', v_shop.name, v_item->>'name', p_foundry_item_id, p_quantity, v_total, auth.uid());

  perform notify_discord(format(
    '💰 **%s** sold %s**%s** for %s gp at %s',
    v_character_name,
    case when p_quantity > 1 then p_quantity || '× ' else '' end,
    v_item->>'name', trim_scale(v_total), v_shop.name
  ));
end;
$$;

-- Grants carry over from 20261019000000: create or replace keeps them.
