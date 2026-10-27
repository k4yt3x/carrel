/**
 * Carrel's mark, the app icon drawn in the interface's own colours: the tile in the text
 * colour and the C and the book in the page colour, so it inverts with the theme. The shapes
 * are the icon's (public/favicon.svg).
 */
export function CarrelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="7" className="fill-fg" />
      <path
        d="M24.5 6.3H10.8A4.5 4.5 0 0 0 6.3 10.8V21.2A4.5 4.5 0 0 0 10.8 25.7H24.5"
        className="fill-none stroke-surface"
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <g className="fill-surface">
        <path d="M16.6 12.6C15.12 11.82 13.3 11.22 10.7 11.3V19.9C13.3 19.82 15.12 20.42 16.6 21.2Z" />
        <path d="M17.8 12.6C19.27 11.82 21.1 11.22 23.7 11.3V19.9C21.1 19.82 19.27 20.42 17.8 21.2Z" />
      </g>
    </svg>
  )
}
