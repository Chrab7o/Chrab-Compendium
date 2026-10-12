import { useEffect, useMemo, useState } from 'react'
import { formatGp, loadCatalog } from '../../../lib/shopPool'
import ItemDialog from '../../shops/ItemDialog'

const MAX_RESULTS = 60

// Search the priced 5etools gear catalog and add items to a store's shelf at
// their list price. Items already on the shelf are marked rather than hidden,
// so the DM can see the search matched them.
export default function CatalogPicker({ stock, onAdd, onClose }) {
  const [catalog, setCatalog] = useState(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [error, setError] = useState(null)
  const [openKey, setOpenKey] = useState(null)
  const openItem = (catalog ?? []).find((item) => item.key === openKey) ?? null

  useEffect(() => {
    loadCatalog().then(setCatalog).catch((err) => setError(err.message))
  }, [])

  const types = useMemo(() => [...new Set((catalog ?? []).map((item) => item.type))].sort(), [catalog])
  const onShelf = useMemo(() => new Set(stock.map((row) => row.item_key).filter(Boolean)), [stock])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (catalog ?? [])
      .filter((item) => (!type || item.type === type) && (!q || item.name.toLowerCase().includes(q)))
      .slice(0, MAX_RESULTS)
  }, [catalog, query, type])

  return (
    <div className="dm-panel">
      <h2>Add from the 5etools catalog</h2>
      {error && <p className="status-message error">{error}</p>}
      <ItemDialog item={openItem} onClose={() => setOpenKey(null)}>
        {openItem &&
          (onShelf.has(openItem.key) ? (
            <span className="badge badge-own">on the shelf</span>
          ) : (
            <button type="button" onClick={() => onAdd(openItem)}>
              Add to shop
            </button>
          ))}
      </ItemDialog>
      <div className="dm-form-row">
        <label>
          Search
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="rope, longsword, potion..." />
        </label>
        <label>
          Category
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {catalog === null ? (
        <p className="status-message">Loading catalog...</p>
      ) : (
        <ul className="shop-homebrew shop-catalog">
          {results.map((item) => (
            <li key={item.key}>
              <span>
                <button type="button" className="shop-card-title" onClick={() => setOpenKey(item.key)}>
                  {item.name}
                </button>{' '}
                <span className="dm-list-meta">{item.type} · {item.source}</span>
              </span>
              <span className="shop-catalog-actions">
                {item.price_gp != null ? (
                  <span className="shop-price">{formatGp(item.price_gp)}</span>
                ) : (
                  <span className="dm-list-meta">no list price — set one after adding</span>
                )}
                {onShelf.has(item.key) ? (
                  <span className="badge badge-own">on the shelf</span>
                ) : (
                  <button type="button" className="secondary" onClick={() => onAdd(item)}>
                    Add
                  </button>
                )}
              </span>
            </li>
          ))}
          {results.length === 0 && <li>No matches.</li>}
        </ul>
      )}
      <div className="dm-form-actions">
        <button type="button" className="secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
