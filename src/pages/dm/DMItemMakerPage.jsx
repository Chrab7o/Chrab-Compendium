import { useEffect, useRef } from 'react'
import idmHtml from '../../components/dm/itemmaker/idm.html?raw'
import '../../components/dm/itemmaker/idm.css'

// Embeds the standalone Item Description Maker tool (a separate repo,
// item-description-maker) per its own IMPLEMENTATION.md: idm.js is a plain
// script (not a module) loaded once, globally, via a <script> tag in
// index.html - see the comment there. It defines window.ItemDescriptionMaker
// and does nothing until init(root) is called. The markup is injected via
// dangerouslySetInnerHTML (a real <script> tag inserted that way wouldn't
// execute, which is exactly why idm.js is loaded separately instead) and
// init() is called on the container ref once it's in the DOM. init() no-ops
// if called twice on the same root (guards via root.__idmInitialized), so
// this is safe under React StrictMode's double-effect-invocation - a fresh
// container element on each mount (e.g. navigating back to this page) just
// gets reinitialized as a fresh widget instance.
export default function DMItemMakerPage() {
  const containerRef = useRef(null)

  useEffect(() => {
    if (containerRef.current && window.ItemDescriptionMaker) {
      window.ItemDescriptionMaker.init(containerRef.current)
    }
  }, [])

  return (
    <section className="page-wide">
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: idmHtml }} />
    </section>
  )
}
