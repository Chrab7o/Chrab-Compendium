import { motion } from 'motion/react'

// Matches nav-starfield-tile.svg's viewBox and index.css's
// .nav-starfield-layer background-size/overhang - keep all three in sync
// if the tile is ever regenerated at a different size.
const TILE_W = 640
const TILE_H = 170

// Drifts the nav's starfield diagonally down and to the right, forever -
// same never-turns-around technique as CloudBackdrop.jsx (translate a
// layer that's oversized by exactly one tile, then reset seamlessly since
// the tile repeats), just driving x and y independently instead of one
// axis. Because the pattern truly tiles in both directions (nav-starfield-
// tile.svg was generated with 3x3 wraparound placement), x and y don't
// need to complete their loops together - each resets cleanly on its own
// tile dimension regardless of where the other axis currently is. Equal
// px/sec speed on both axes (rather than equal duration) is what keeps the
// diagonal direction constant even though a full Y loop (a much shorter
// distance) finishes far more often than a full X loop.
const SPEED_PX_PER_SEC = 18

export default function NavStarfield() {
  return (
    <div className="nav-starfield-viewport" aria-hidden="true">
      <motion.div
        className="nav-starfield-layer"
        animate={{ x: [0, TILE_W], y: [0, TILE_H] }}
        transition={{
          x: { duration: TILE_W / SPEED_PX_PER_SEC, repeat: Infinity, repeatType: 'loop', ease: 'linear' },
          y: { duration: TILE_H / SPEED_PX_PER_SEC, repeat: Infinity, repeatType: 'loop', ease: 'linear' },
        }}
      />
    </div>
  )
}
