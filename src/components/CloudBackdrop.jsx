import { motion } from 'motion/react'

// A slow left-to-right drift across the desk backdrop's cloud layer -
// horizontal only (backgroundPositionY stays put on .cloud-backdrop's own
// CSS) so it reads as clouds blowing sideways rather than drifting on a
// diagonal. repeatType: 'mirror' pans back right-to-left afterward rather
// than snapping at the end of each cycle, which is what lets this stay a
// single static image instead of a seamless tile.
export default function CloudBackdrop() {
  return (
    <motion.div
      className="cloud-backdrop"
      aria-hidden="true"
      animate={{ backgroundPositionX: ['30%', '70%'] }}
      transition={{ duration: 22, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
    />
  )
}
