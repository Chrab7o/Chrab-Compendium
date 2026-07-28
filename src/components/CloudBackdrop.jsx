import { motion } from 'motion/react'

// A continuous left-to-right drift across the desk backdrop's cloud layer -
// never reverses, unlike the mirrored version this replaced. Two identical
// tiles sit side by side (.cloud-backdrop-row, 200vw wide); at x: -100vw,
// tile two exactly fills the viewport with tile one waiting off-screen to
// the left, so translating the row rightward from -100vw to 0vw brings
// tile one into view from the left edge while tile two exits to the right -
// content entering from the left and leaving to the right is what actually
// reads as "left to right" (translating the opposite way makes content
// enter from the right instead). Resetting from 0vw back to -100vw at the
// end of each loop is invisible, since dream-clouds-tile.webp was
// composited to tile seamlessly (its right edge matches its left edge) -
// tile one at x: 0vw looks identical to tile two at x: -100vw.
// repeatType: 'loop' is what does that reset (as opposed to 'mirror', which
// would reverse direction instead). Animates `x` (a CSS transform), not
// backgroundPosition, since a transform is handled entirely by the
// compositor at a cost independent of viewport size - animating
// backgroundPosition instead forces a full repaint every frame, which is
// what made an earlier version of this stall out on wide windows.
export default function CloudBackdrop() {
  return (
    <div className="cloud-backdrop" aria-hidden="true">
      <motion.div
        className="cloud-backdrop-row"
        animate={{ x: ['-100vw', '0vw'] }}
        transition={{ duration: 250, repeat: Infinity, repeatType: 'loop', ease: 'linear' }}
      >
        <div className="cloud-backdrop-tile" />
        <div className="cloud-backdrop-tile" />
      </motion.div>
    </div>
  )
}
