import { motion } from 'motion/react'

// A slow, barely-there drift across the desk backdrop's cloud layer - subtle
// on purpose, since this sits behind every page and needs to read as ambient
// weather, not something competing for attention. repeatType: 'mirror' pans
// back and forth rather than snapping at the end of each cycle, which is what
// lets this stay a single static image instead of a seamless tile.
export default function CloudBackdrop() {
  return (
    <motion.div
      className="cloud-backdrop"
      aria-hidden="true"
      animate={{ backgroundPosition: ['45% 45%', '55% 55%'] }}
      transition={{ duration: 60, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
    />
  )
}
