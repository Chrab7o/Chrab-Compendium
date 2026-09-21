import { useEffect, useRef } from 'react'
import idmHtml from '../../components/dm/itemmaker/idm.html?raw'
import '../../components/dm/itemmaker/idm.css'
import '../../components/dm/itemmaker/idm.js'
import { createSupabaseItemStorage } from '../../lib/itemMakerStorage'

// Embeds the standalone Item Description Maker tool (a separate repo,
// item-description-maker). idm.js is an IIFE that defines
// window.ItemDescriptionMaker and does nothing until init(root) is called,
// so importing it for its side effect is enough - it used to be a <script
// src="/idm.js"> tag in index.html, but an unhashed file in public/ is
// served with a 4-hour cache and browsers went on running the old copy for
// hours after a deploy (which is how a phone kept saving items to
// localStorage after the Supabase switch shipped). Bundled here, it gets a
// content-hashed filename and a stale copy is impossible.
//
// The markup is still injected via dangerouslySetInnerHTML, and init() is
// called on the container ref once it's in the DOM. init() no-ops
// if called twice on the same root (guards via root.__idmInitialized), so
// this is safe under React StrictMode's double-effect-invocation - a fresh
// container element on each mount (e.g. navigating back to this page) just
// gets reinitialized as a fresh widget instance.
//
// The storage adapter is what keeps saved items on the account rather than in
// one browser: idm.js defaults to localStorage (correct for the standalone
// tool), and this page swaps in the Supabase-backed one from
// src/lib/itemMakerStorage.js.
export default function DMItemMakerPage() {
  const containerRef = useRef(null)

  useEffect(() => {
    if (containerRef.current && window.ItemDescriptionMaker) {
      window.ItemDescriptionMaker.init(containerRef.current, { storage: createSupabaseItemStorage() })
    }
  }, [])

  return (
    <section className="page-wide">
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: idmHtml }} />
    </section>
  )
}
