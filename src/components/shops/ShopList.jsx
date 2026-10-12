import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { formatGp } from '../../lib/shopPool'
import { useStoreAccount } from './StoreTrading'

// The Shops tab on the player hub: every shop the party can visit in this
// campaign, so players get there without being sent a link.
//
// Only public shops, filtered here as well as by RLS: a DM previewing as a
// player would otherwise see their DM-only shops too, which a player can't.
// Campaign-less shops are "general" and show in every campaign.
export default function ShopList({ campaignId, characterId }) {
  const [shops, setShops] = useState(undefined)
  const { account } = useStoreAccount(characterId)

  useEffect(() => {
    let query = supabase
      .from('shops')
      .select('id, name, slug, kind, is_open, blurb, campaign_id')
      .eq('visibility', 'public')
      .order('name')
    query = campaignId ? query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`) : query.is('campaign_id', null)
    query.then(({ data }) => setShops(data ?? []))
  }, [campaignId])

  if (shops === undefined) return <p className="status-message">Loading...</p>

  return (
    <section>
      <div className="view-header">
        <h1>Shops</h1>
        {account && (
          <p className="view-subtitle">
            {account.name} has <span className="shop-price">{formatGp(account.balance)}</span> to spend.
          </p>
        )}
      </div>

      {shops.length === 0 ? (
        <p className="status-message">No shops are open to the party yet.</p>
      ) : (
        <ul className="shop-list">
          {shops.map((shop) => (
            <li key={shop.id}>
              <Link to={`/shop/${shop.slug}`} className="shop-list-card">
                <span className="shop-list-head">
                  <strong>{shop.name}</strong>
                  <span className={`badge ${shop.is_open ? 'badge-open' : 'badge-closed'}`}>
                    {shop.is_open ? 'Open' : 'Closed'}
                  </span>
                </span>
                <span className="dm-list-meta">
                  {shop.kind === 'store' ? 'Buy and sell here' : 'Browse the wares — trade at the table'}
                </span>
                {shop.blurb && <span className="shop-list-blurb">{firstLine(shop.blurb)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// The blurb is markdown and can run long; the list wants one plain line.
function firstLine(markdown) {
  const line = markdown.split('\n').find((l) => l.trim()) ?? ''
  return line.replace(/[#*_>`[\]]/g, '').trim()
}
