import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { formatGp } from '../../lib/shopPool'

const SELLABLE_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'])
const DENOMINATION_GP = { pp: 10, gp: 1, ep: 0.5, sp: 0.1, cp: 0.01 }

// The viewer's side of a store: their spendable gold, their trades that
// haven't reached Foundry yet, and their imported inventory for selling.
//
// Balance comes from character_balance_gp() in the database rather than being
// summed here, so the page and the trade functions can't disagree about it.
export function useStoreAccount(characterId) {
  const [account, setAccount] = useState(null)

  const refresh = useCallback(async () => {
    if (!characterId) {
      setAccount(null)
      return
    }
    const [{ data: balance }, { data: character }, { data: pending }] = await Promise.all([
      supabase.rpc('character_balance_gp', { p_character_id: characterId }),
      supabase.from('characters').select('name, raw_data').eq('id', characterId).single(),
      supabase
        .from('shop_transactions')
        .select('*')
        .eq('character_id', characterId)
        .is('settled_at', null)
        .order('created_at', { ascending: false }),
    ])
    setAccount({
      balance: Number(balance ?? 0),
      name: character?.name ?? '',
      inventory: character?.raw_data?.items ?? [],
      pending: pending ?? [],
    })
  }, [characterId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { account, refresh }
}

export function WalletBar({ account }) {
  if (!account) return null
  return (
    <div className="shop-wallet">
      <span>
        <strong>{account.name}</strong> has <span className="shop-price">{formatGp(account.balance)}</span> to spend
      </span>
      {account.pending.length > 0 && (
        <span className="dm-list-meta">
          includes {account.pending.length} trade{account.pending.length === 1 ? '' : 's'} the DM hasn't applied in
          Foundry yet
        </span>
      )}
    </div>
  )
}

export function BuyControl({ item, characterId, account, onTrade }) {
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const max = item.quantity ?? 99
  const total = Number(item.price_gp) * quantity
  const affordable = account && total <= account.balance

  async function handleBuy() {
    if (!confirm(`Buy ${quantity > 1 ? `${quantity}× ` : ''}${item.name} for ${formatGp(total)}?`)) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('shop_buy', {
      p_character_id: characterId,
      p_shop_item_id: item.id,
      p_quantity: quantity,
    })
    setBusy(false)
    if (rpcError) setError(rpcError.message)
    else {
      setQuantity(1)
      onTrade()
    }
  }

  return (
    <div className="shop-buy">
      {max > 1 && (
        <input
          type="number"
          min="1"
          max={max}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
          aria-label="Quantity"
        />
      )}
      <button type="button" onClick={handleBuy} disabled={busy || !affordable}>
        {busy ? 'Buying...' : affordable ? `Buy · ${formatGp(total)}` : 'Not enough gold'}
      </button>
      {error && <span className="status-message error">{error}</span>}
    </div>
  )
}

// Selling works off the inventory as of the last Foundry import, at the
// store's sell rate (set by the DM; no haggling on the page). Value is the
// item's Foundry price, or - when that's 0 - the shop's own listed price for
// an item of the same name. shop_sell() does the same; this only previews it.
// Items already sold but not yet removed in Foundry are subtracted so they
// can't be sold twice.
export function SellPanel({ shop, items, characterId, account, onTrade }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const rate = Number(shop.sell_rate ?? 0.5)
  // The shop's purse; null = unlimited. shop_sell() enforces it.
  const coin = shop.coin_gp == null ? null : Number(shop.coin_gp)

  const sellable = useMemo(() => {
    if (!account) return []
    const pendingSold = {}
    for (const t of account.pending) {
      if (t.kind === 'sell' && t.foundry_item_id) {
        pendingSold[t.foundry_item_id] = (pendingSold[t.foundry_item_id] ?? 0) + t.quantity
      }
    }
    const listed = {}
    for (const row of items) {
      if (row.price_gp == null) continue
      const key = row.name.toLowerCase()
      listed[key] = Math.max(listed[key] ?? 0, Number(row.price_gp))
    }
    return account.inventory
      .filter((i) => SELLABLE_TYPES.has(i.type))
      .map((i) => {
        const foundryGp =
          (Number(i.system?.price?.value) || 0) * (DENOMINATION_GP[i.system?.price?.denomination] ?? 1)
        const unit = foundryGp > 0 ? foundryGp : (listed[i.name.toLowerCase()] ?? 0)
        const left = (Number(i.system?.quantity) || 1) - (pendingSold[i._id] ?? 0)
        return { id: i._id, name: i.name, left, offer: Math.floor(unit * rate * 100) / 100 }
      })
      .filter((i) => i.left > 0 && i.offer > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [account, items, rate])

  async function handleSell(item) {
    if (!confirm(`Sell ${item.name} for ${formatGp(item.offer)}?`)) return
    setBusyId(item.id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('shop_sell', {
      p_character_id: characterId,
      p_shop_id: shop.id,
      p_foundry_item_id: item.id,
      p_quantity: 1,
    })
    setBusyId(null)
    if (rpcError) setError(rpcError.message)
    else onTrade()
  }

  if (!account) return null

  return (
    <div className="dm-panel shop-sell">
      <h2>Sell to {shop.name}</h2>
      <p className="view-subtitle">
        Pays {Math.round(rate * 100)}% of what an item is worth — no haggling on the page. Your inventory is as of
        the DM's last Foundry import.
      </p>
      {coin != null && (
        <p className="shop-purse">
          The shopkeeper has <span className="shop-price">{formatGp(coin)}</span> on hand to buy with.
        </p>
      )}
      {error && <p className="status-message error">{error}</p>}
      {sellable.length === 0 ? (
        <p className="status-message">Nothing in your pack this shop will pay for.</p>
      ) : (
        <ul className="shop-homebrew">
          {sellable.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.name}</strong>
                {item.left > 1 && <span className="dm-list-meta"> ×{item.left}</span>}
              </span>
              <button
                type="button"
                className="secondary"
                onClick={() => handleSell(item)}
                disabled={busyId === item.id || (coin != null && item.offer > coin)}
              >
                {busyId === item.id
                  ? 'Selling...'
                  : coin != null && item.offer > coin
                    ? `Can't afford ${formatGp(item.offer)}`
                    : `Sell · ${formatGp(item.offer)}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
