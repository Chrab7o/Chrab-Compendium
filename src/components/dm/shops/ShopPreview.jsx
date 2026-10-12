import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { useImpersonation } from '../../../contexts/ImpersonationContext'

// Open the shop's player page as one of the party, using the same "View as"
// impersonation the Characters page has - so the wallet, buy buttons and sell
// panel show exactly what that player gets. The banner at the top of the site
// ends the preview.
//
// Impersonation only changes what the page shows. Trades made while
// previewing are real (the DM is allowed to trade on a character's behalf),
// hence the warning.
export default function ShopPreview({ shop }) {
  const navigate = useNavigate()
  const { startImpersonating } = useImpersonation()
  const [characters, setCharacters] = useState([])
  const [characterId, setCharacterId] = useState('')

  useEffect(() => {
    // Only characters with a player: impersonation is keyed to the owner.
    let query = supabase.from('characters').select('id, name, owner_id').not('owner_id', 'is', null).order('name')
    if (shop.campaign_id) query = query.eq('campaign_id', shop.campaign_id)
    query.then(({ data }) => setCharacters(data ?? []))
  }, [shop.campaign_id])

  function preview() {
    const character = characters.find((c) => c.id === characterId)
    if (character) startImpersonating(character)
    navigate(`/shop/${shop.slug}`)
  }

  return (
    <div className="shop-url">
      <label className="shop-inline-field">
        Preview as
        <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
          <option value="">Just browse (no character)</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="secondary" onClick={preview}>
        Open player view
      </button>
      {characterId && <span>Trades you make while previewing are real.</span>}
    </div>
  )
}
