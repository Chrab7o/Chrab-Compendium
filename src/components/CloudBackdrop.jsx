import { motion } from 'motion/react'

// A left-to-right drift across the desk backdrop's cloud layer - horizontal
// only (backgroundPositionY stays put on .cloud-backdrop's own CSS) so it
// reads as clouds blowing sideways rather than drifting on a diagonal.
// ease: 'linear' matters here as much as duration does - easeInOut slows to
// a near-standstill right at each end of the mirror, which read as "not
// moving" for a big chunk of the cycle; linear keeps it moving at a
// constant, obviously-visible speed the whole time. repeatType: 'mirror'
// pans back right-to-left afterward rather than snapping, which is what
// lets this stay a single static image instead of a seamless tile.
export default function CloudBackdrop() {
  return (
    <motion.div
      className="cloud-backdrop"
      aria-hidden="true"
      animate={{ backgroundPositionX: ['20%', '80%'] }}
      transition={{ duration: 9, repeat: Infinity, repeatType: 'mirror', ease: 'linear' }}
    />
  )
}
