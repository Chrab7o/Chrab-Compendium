import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { attunementLabel, formatGp, slugify } from '../lib/shopPool'
import { useMyCharacter } from '../hooks/useMyCharacter'
import { BuyControl, SellPanel, WalletBar, useStoreAccount } from '../components/shops/StoreTrading'

// What a shop looks like to the party: a blurb and everything on the shelf.
//
// An 'exchange' shop is read-only here - its trading happens at the table and
// the DM logs it. A 'store' adds buy buttons, a sell panel and the viewer's
// spendable gold; the trade itself is a database function that checks price,
// stock and balance, so nothing on this page is trusted.
//
// Visibility is enforced by RLS: a DM-only shop simply returns no row for a
// player, and its stock is unreachable even by id. A closed shop is visible
// but shows a sign instead of its shelf, and the trade functions refuse it.
export default function ShopDetail() {
  const { slug } = useParams()
  const { characterId } = useMyCharacter()
  // undefined = still loading, null = no such (visible) shop.
  const [shop, setShop] = useState(undefined)
  const [items, setItems] = useState([])

  const isStore = shop?.kind === 'store'
  const trading = isStore && shop.is_open && !!characterId
  const { account, refresh } = useStoreAccount(trading ? characterId : null)

  const load = useCallback(async () => {
    const { data: shopRow } = await supabase.from('shops').select('*').eq('slug', slug).maybeSingle()
    if (!shopRow) {
      setShop(null)
      return
    }
    const { data: stock } = await supabase
      .from('shop_items')
      .select('*')
      .eq('shop_id', shopRow.id)
      .order('position', { ascending: true })
    setShop(shopRow)
    setItems(stock ?? [])
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  function afterTrade() {
    load()
    refresh()
  }

  if (shop === undefined) return <p className="status-message">Loading...</p>
  if (shop === null) return <p className="status-message error">Couldn't find that shop.</p>

  return (
    <section className="page shop-page">
      <div className="view-header">
        <h1>{shop.name}</h1>
        {shop.visibility === 'dm' && <p className="badge badge-dm">DM only — players can't see this yet</p>}
      </div>

      {shop.blurb && (
        <div className="entry-content shop-blurb">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{shop.blurb}</ReactMarkdown>
        </div>
      )}

      {!shop.is_open ? (
        <div className="shop-closed-sign">
          <strong>Closed</strong>
          <span>The shutters are down. Check back later.</span>
        </div>
      ) : (
        <>
          {trading && <WalletBar account={account} />}
          {isStore && characterId === null && (
            <p className="status-message">You need a character in this campaign to trade here.</p>
          )}

          {items.length === 0 ? (
            <p className="status-message">The shelves are bare right now.</p>
          ) : (
            <div className="shop-shelf">
              {items.map((item) => {
                const attune = attunementLabel(item.attunement)
                const soldOut = item.quantity === 0
                return (
                  <article key={item.id} className={`shop-card${soldOut ? ' is-sold-out' : ''}`}>
                    <header className="shop-card-header">
                      <h2>{item.name}</h2>
                      {item.rarity && <span className={`badge rarity-${slugify(item.rarity)}`}>{item.rarity}</span>}
                    </header>
                    {(item.price_gp != null || item.quantity != null) && (
                      <p className="shop-card-price">
                        {item.price_gp != null && <span className="shop-price">{formatGp(item.price_gp)}</span>}
                        {item.quantity != null && (
                          <span className="dm-list-meta">{soldOut ? 'Sold out' : `${item.quantity} left`}</span>
                        )}
                      </p>
                    )}
                    {attune && <p className="shop-attune">{attune}</p>}
                    <div className="entry-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.description}</ReactMarkdown>
                    </div>
                    {trading && item.price_gp != null && !soldOut && (
                      <BuyControl item={item} characterId={characterId} account={account} onTrade={afterTrade} />
                    )}
                  </article>
                )
              })}
            </div>
          )}

          {trading && <SellPanel shop={shop} items={items} characterId={characterId} account={account} onTrade={afterTrade} />}
        </>
      )}
    </section>
  )
}
