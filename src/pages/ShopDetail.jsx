import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { attunementLabel, slugify } from '../lib/shopPool'

// What a shop looks like to the party: a blurb and everything on the shelf,
// descriptions and all. Nothing is buyable here - the trading happens at the
// table - so this page is read-only by design, not just by omission.
//
// Visibility is enforced by RLS: a DM-only shop simply returns no row for a
// player, and its stock is unreachable even by id. There is no client-side
// check here because there is nothing for one to protect.
export default function ShopDetail() {
  const { slug } = useParams()
  // undefined = still loading, null = no such (visible) shop.
  const [shop, setShop] = useState(undefined)
  const [items, setItems] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: shopRow } = await supabase.from('shops').select('*').eq('slug', slug).maybeSingle()
      if (cancelled) return
      if (!shopRow) {
        setShop(null)
        return
      }
      const { data: stock } = await supabase
        .from('shop_items')
        .select('*')
        .eq('shop_id', shopRow.id)
        .order('position', { ascending: true })
      if (cancelled) return
      setShop(shopRow)
      setItems(stock ?? [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug])

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

      {items.length === 0 ? (
        <p className="status-message">The shelves are bare right now.</p>
      ) : (
        <div className="shop-shelf">
          {items.map((item) => {
            const attune = attunementLabel(item.attunement)
            return (
              <article key={item.id} className="shop-card">
                <header className="shop-card-header">
                  <h2>{item.name}</h2>
                  {item.rarity && (
                    <span className={`badge rarity-${slugify(item.rarity)}`}>{item.rarity}</span>
                  )}
                </header>
                {attune && <p className="shop-attune">{attune}</p>}
                <div className="entry-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.description}</ReactMarkdown>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
