import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { attunementLabel, formatGp, slugify } from '../../lib/shopPool'

// Full details for one shop item: name, rarity, price, stock and the complete
// rules text. Takes either a shop_items row (`description`) or a catalog
// record (`text`), so the player shelf, the DM stock list and the catalog
// picker can all open the same view.
//
// Built on the native <dialog>: showModal() gives the backdrop, focus
// trapping and Esc-to-close without any extra code. `children` is the action
// row - a Buy control, an Add button - so the caller decides what can be done.
export default function ItemDialog({ item, onClose, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (item && dialog && !dialog.open) dialog.showModal()
    if (!item && dialog?.open) dialog.close()
  }, [item])

  if (!item) return null

  const attune = attunementLabel(item.attunement)
  const text = item.description ?? item.text ?? ''
  const meta = [item.type, item.source].filter(Boolean).join(' · ')

  return (
    <dialog
      ref={ref}
      className="item-dialog"
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> element itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <header className="item-dialog-header">
        <div>
          <h2>{item.name}</h2>
          {meta && <p className="dm-list-meta">{meta}</p>}
        </div>
        <button type="button" className="secondary" onClick={onClose} aria-label="Close">
          Close
        </button>
      </header>

      <div className="item-dialog-tags">
        {item.rarity && <span className={`badge rarity-${slugify(item.rarity)}`}>{item.rarity}</span>}
        {item.price_gp != null && <span className="shop-price">{formatGp(item.price_gp)}</span>}
        {item.quantity != null && (
          <span className="dm-list-meta">{item.quantity === 0 ? 'Sold out' : `${item.quantity} left`}</span>
        )}
      </div>
      {attune && <p className="shop-attune">{attune}</p>}

      <div className="entry-content item-dialog-body">
        {text.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        ) : (
          <p className="status-message">No description.</p>
        )}
      </div>

      {children && <div className="item-dialog-actions">{children}</div>}
    </dialog>
  )
}
