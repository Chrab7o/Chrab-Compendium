import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { formatGp } from '../../../lib/shopPool'

const emptyTrade = { characterId: '', kind: 'buy', itemName: '', quantity: 1, total: '', note: '', removeFromShelf: true }

// The shop's trade ledger, plus a form for logging trades made at the table.
// Every trade - logged here or made by a player on a store page - posts to
// Discord from the database function that writes it, so this component never
// talks to the webhook itself.
//
// "Pending" trades haven't been applied in Foundry yet; the Foundry importer
// settles them. Until then they count toward the character's balance.
export default function ShopTransactions({ shop, stock, onStockChange }) {
  const [characters, setCharacters] = useState([])
  const [trades, setTrades] = useState([])
  const [draft, setDraft] = useState(emptyTrade)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    let characterQuery = supabase.from('characters').select('id, name, campaign_id').order('name')
    if (shop.campaign_id) characterQuery = characterQuery.eq('campaign_id', shop.campaign_id)
    const [{ data: characterRows }, { data: tradeRows, error: tradeError }] = await Promise.all([
      characterQuery,
      supabase
        .from('shop_transactions')
        .select('*, characters(name)')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    if (tradeError) setError(tradeError.message)
    setCharacters(characterRows ?? [])
    setTrades(tradeRows ?? [])
  }, [shop.id, shop.campaign_id])

  useEffect(() => {
    load()
  }, [load])

  const matched = stock.find((row) => row.name === draft.itemName) ?? null

  // Prefill the total from the shelf price when the item is on the shelf, but
  // only while the DM hasn't typed a total of their own.
  function setItem(itemName) {
    const row = stock.find((r) => r.name === itemName)
    setDraft((prev) => ({
      ...prev,
      itemName,
      total: prev.total === '' && row?.price_gp != null ? String(row.price_gp * prev.quantity) : prev.total,
    }))
  }

  async function handleRecord(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const quantity = Math.max(1, Number(draft.quantity) || 1)
    const { error: rpcError } = await supabase.rpc('shop_record_trade', {
      p_character_id: draft.characterId,
      p_shop_id: shop.id,
      p_kind: draft.kind,
      p_item_name: draft.itemName.trim(),
      p_quantity: quantity,
      p_total_gp: Number(draft.total) || 0,
      p_note: draft.note.trim(),
    })
    if (rpcError) {
      setError(rpcError.message)
      setSaving(false)
      return
    }
    // An exchange item that's been bought is gone; a store keeps its own count.
    if (draft.kind === 'buy' && matched && draft.removeFromShelf) {
      if (shop.kind === 'exchange') {
        await supabase.from('shop_items').delete().eq('id', matched.id)
      } else if (matched.quantity != null) {
        await supabase
          .from('shop_items')
          .update({ quantity: Math.max(0, matched.quantity - quantity) })
          .eq('id', matched.id)
      }
    }
    // Always: even without a shelf change, the trade moved the shop's purse.
    onStockChange?.()
    setDraft({ ...emptyTrade, characterId: draft.characterId })
    setSaving(false)
    load()
  }

  async function handleUndo(trade) {
    if (!confirm(`Undo ${trade.characters?.name ?? 'this'}'s ${trade.kind} of ${trade.item_name}?`)) return
    const { error: rpcError } = await supabase.rpc('shop_undo_trade', { p_transaction_id: trade.id })
    if (rpcError) setError(rpcError.message)
    else {
      load()
      onStockChange?.()
    }
  }

  const canSubmit = draft.characterId && draft.itemName.trim() && draft.total !== ''

  return (
    <div className="dm-panel">
      <h2>Trades</h2>
      <p className="view-subtitle">
        Log a trade made at the table — it posts to Discord.{' '}
        {shop.kind === 'store' && 'Players trading on the page are logged automatically. '}
        Pending trades still need applying in Foundry; settle them there from the Chrab Sync window (or with the next manual import).
      </p>
      {error && <p className="status-message error">{error}</p>}

      <form onSubmit={handleRecord} className="dm-form">
        <div className="dm-form-row">
          <label>
            Character
            <select
              value={draft.characterId}
              onChange={(e) => setDraft({ ...draft, characterId: e.target.value })}
              required
            >
              <option value="">Choose...</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trade
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              <option value="buy">Bought from the shop</option>
              <option value="sell">Sold to the shop</option>
            </select>
          </label>
        </div>
        <div className="dm-form-row">
          <label>
            Item
            <input
              list={`shop-stock-${shop.id}`}
              value={draft.itemName}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Pick from the shelf or type anything"
              required
            />
            <datalist id={`shop-stock-${shop.id}`}>
              {stock.map((row) => (
                <option key={row.id} value={row.name} />
              ))}
            </datalist>
          </label>
          <label>
            Quantity
            <input
              type="number"
              min="1"
              value={draft.quantity}
              onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
            />
          </label>
          <label>
            Total (gp)
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.total}
              onChange={(e) => setDraft({ ...draft, total: e.target.value })}
              required
            />
          </label>
        </div>
        <label>
          Note (optional, shown in Discord)
          <input
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder="e.g. traded for a favour owed"
          />
        </label>
        {draft.kind === 'buy' && matched && (shop.kind === 'exchange' || matched.quantity != null) && (
          <label className="shop-source">
            <input
              type="checkbox"
              checked={draft.removeFromShelf}
              onChange={(e) => setDraft({ ...draft, removeFromShelf: e.target.checked })}
            />
            <span>{shop.kind === 'exchange' ? 'Take it off the shelf' : 'Reduce the shelf count'}</span>
          </label>
        )}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving || !canSubmit}>
            {saving ? 'Recording...' : 'Record trade'}
          </button>
        </div>
      </form>

      {trades.length === 0 ? (
        <p className="status-message">No trades yet.</p>
      ) : (
        <ul className="dm-list shop-trades">
          {trades.map((trade) => (
            <li key={trade.id}>
              <div className="shop-stock-main">
                <span className={`badge ${trade.kind === 'buy' ? 'badge-buy' : 'badge-sell'}`}>
                  {trade.kind === 'buy' ? 'Bought' : 'Sold'}
                </span>
                <strong>{trade.characters?.name ?? 'Unknown'}</strong>
                <span>
                  {trade.quantity > 1 && `${trade.quantity}× `}
                  {trade.item_name}
                </span>
                <span className="shop-price">{formatGp(trade.total_gp)}</span>
                {trade.settled_at ? (
                  <span className="badge badge-own">settled</span>
                ) : (
                  <span className="badge badge-pending">pending in Foundry</span>
                )}
                <span className="dm-list-meta">{new Date(trade.created_at).toLocaleString()}</span>
                {trade.note && <span className="dm-list-meta">— {trade.note}</span>}
              </div>
              <div className="dm-list-actions">
                <button type="button" className="secondary" onClick={() => handleUndo(trade)}>
                  Undo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
