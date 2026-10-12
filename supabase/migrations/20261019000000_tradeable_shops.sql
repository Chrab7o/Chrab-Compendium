-- Two kinds of shop, and a trade ledger.
--
-- 'exchange' is the original rotating magic-item shop (Ru's): stock is rolled,
-- trading still happens at the table, and the DM logs what changed hands so
-- it lands in Discord and the history. 'store' is a curated, priced shop the
-- players trade with directly on the page.
--
-- Gold stays owned by Foundry (see 20261018000000_character_foundry_sync.sql).
-- A trade does NOT edit characters.currency - that column is overwritten on
-- every import. Instead each trade is a ledger row that is "unsettled" until
-- the DM applies it in Foundry and re-imports; the importer then stamps
-- settled_at. A character's spendable balance is therefore
--   imported currency + unsettled sells - unsettled buys
-- which stays correct across any number of trades between imports.

alter table shops
  add column kind text not null default 'exchange' check (kind in ('exchange', 'store')),
  -- Closed shops stay visible (the page says it's closed) but can't trade.
  add column is_open boolean not null default true;

alter table shop_items
  -- Per unit, in gp. Null = not for sale on the page (exchange shops, or a
  -- store item the DM hasn't priced yet).
  add column price_gp numeric check (price_gp >= 0),
  -- Null = unlimited. Decremented by purchases; 0 shows as sold out.
  add column quantity integer check (quantity >= 0);

create table shop_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops(id) on delete set null,
  character_id uuid not null references characters(id) on delete cascade,
  kind text not null check (kind in ('buy', 'sell')),
  -- Snapshots, so the history still reads correctly after the stock row or
  -- the shop is gone.
  shop_name text not null,
  item_name text not null,
  shop_item_id uuid references shop_items(id) on delete set null,
  -- The Foundry item a sale came from, so the same item can't be sold twice
  -- before the next import.
  foundry_item_id text,
  quantity integer not null default 1 check (quantity > 0),
  -- Total for the whole line, in gp, always positive; `kind` gives the sign.
  total_gp numeric not null check (total_gp >= 0),
  note text not null default '',
  recorded_by uuid references profiles(id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index shop_transactions_character_id_idx on shop_transactions(character_id);
create index shop_transactions_shop_id_idx on shop_transactions(shop_id);

alter table shop_transactions enable row level security;

create policy "owner reads own transactions"
  on shop_transactions for select
  using (
    is_dm()
    or exists (select 1 from characters c where c.id = character_id and c.owner_id = auth.uid())
  );

-- Players never write here directly - only through the trade functions below,
-- which check price, stock and balance.
create policy "dm manages transactions"
  on shop_transactions for all
  using (is_dm())
  with check (is_dm());

-- Balance --------------------------------------------------------------------

create or replace function public.currency_to_gp(p_currency jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce((p_currency->>'pp')::numeric, 0) * 10
       + coalesce((p_currency->>'gp')::numeric, 0)
       + coalesce((p_currency->>'ep')::numeric, 0) * 0.5
       + coalesce((p_currency->>'sp')::numeric, 0) * 0.1
       + coalesce((p_currency->>'cp')::numeric, 0) * 0.01
$$;

-- Security invoker: RLS decides whose balance the caller may see.
create or replace function public.character_balance_gp(p_character_id uuid)
returns numeric
language sql
stable
as $$
  select currency_to_gp(c.currency)
       + coalesce((
           select sum(case when t.kind = 'sell' then t.total_gp else -t.total_gp end)
           from shop_transactions t
           where t.character_id = c.id and t.settled_at is null
         ), 0)
  from characters c
  where c.id = p_character_id
$$;

grant execute on function public.currency_to_gp(jsonb) to authenticated;
grant execute on function public.character_balance_gp(uuid) to authenticated;

-- Trades ---------------------------------------------------------------------

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
  select * into v_shop from shops where id = v_item.shop_id;

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

  perform notify_discord(format(
    '🛒 **%s** bought %s**%s** for %s gp at %s',
    v_character_name,
    case when p_quantity > 1 then p_quantity || '× ' else '' end,
    v_item.name, trim_scale(v_total), v_shop.name
  ));
end;
$$;

-- A player (or the DM) sells an item from their imported Foundry inventory to
-- a store. The price comes from the item's own Foundry price, never from the
-- caller.
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

  -- Value is what this shop lists the same item for, if it stocks one - so a
  -- potion the DM priced sells back at half that, even when Foundry has it at
  -- 0 gp - and otherwise the item's own Foundry price.
  select price_gp into v_unit_gp
  from shop_items
  where shop_id = p_shop_id and lower(name) = lower(v_item->>'name') and price_gp is not null
  order by price_gp desc
  limit 1;
  v_unit_gp := coalesce(v_unit_gp,
    coalesce((v_item->'system'->'price'->>'value')::numeric, 0)
    * case coalesce(v_item->'system'->'price'->>'denomination', 'gp')
        when 'pp' then 10 when 'ep' then 0.5 when 'sp' then 0.1 when 'cp' then 0.01 else 1
      end);
  if v_unit_gp <= 0 then
    raise exception 'that item has no value to sell';
  end if;
  -- Stores always pay half value, rounded down to the copper. Fixed on
  -- purpose: haggling happens at the table, not on the page.
  v_total := floor(v_unit_gp * 0.5 * p_quantity * 100) / 100;

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

  perform notify_discord(format(
    '%s **%s** %s %s**%s** for %s gp at %s%s',
    case when p_kind = 'buy' then '🛒' else '💰' end,
    v_character_name,
    case when p_kind = 'buy' then 'bought' else 'sold' end,
    case when p_quantity > 1 then p_quantity || '× ' else '' end,
    p_item_name, trim_scale(p_total_gp), v_shop_name,
    case when coalesce(p_note, '') <> '' then ' — ' || p_note else '' end
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
  delete from shop_transactions where id = v_tx.id;

  select name into v_character_name from characters where id = v_tx.character_id;
  perform notify_discord(format(
    '↩️ Undone: **%s** %s **%s** at %s',
    v_character_name,
    case when v_tx.kind = 'buy' then 'buying' else 'selling' end,
    v_tx.item_name, v_tx.shop_name
  ));
end;
$$;

grant execute on function public.shop_buy(uuid, uuid, integer) to authenticated;
grant execute on function public.shop_sell(uuid, uuid, text, integer) to authenticated;
grant execute on function public.shop_record_trade(uuid, uuid, text, text, integer, numeric, text) to authenticated;
grant execute on function public.shop_undo_trade(uuid) to authenticated;
revoke execute on function public.shop_buy(uuid, uuid, integer) from anon;
revoke execute on function public.shop_sell(uuid, uuid, text, integer) from anon;
revoke execute on function public.shop_record_trade(uuid, uuid, text, text, integer, numeric, text) from anon;
revoke execute on function public.shop_undo_trade(uuid) from anon;
