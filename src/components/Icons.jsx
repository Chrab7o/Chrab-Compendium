// Small inline SVG icons, kept minimal and stroke-based to match a single
// consistent line-icon style across the app instead of emoji glyphs.

export function BrowseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" {...props}>
      <path
        d="M12 6.5c-1.5-1.3-3.7-2-6.5-2-.5 0-1 .3-1 1v11c0 .6.5 1 1 1 2.8 0 5 .7 6.5 2 1.5-1.3 3.7-2 6.5-2 .5 0 1-.4 1-1v-11c0-.7-.5-1-1-1-2.8 0-5 .7-6.5 2Z"
        strokeLinejoin="round"
      />
      <path d="M12 6.5v13" strokeLinejoin="round" />
    </svg>
  )
}

export function MenuIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  )
}

export function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  )
}
