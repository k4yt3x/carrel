import type { OutlineOptions } from 'foliate-js/overlayer.js'

let themed = false

/**
 * Outlines search matches in the theme's focus colour rather than foliate-js's red. The view
 * draws them with `Overlayer.outline` and no options, so the default colour is supplied here,
 * read from the theme when each outline is drawn.
 */
export async function themeSearchMarks(): Promise<void> {
  if (themed) return
  themed = true
  const { Overlayer } = await import('foliate-js/overlayer.js')
  const outline = Overlayer.outline.bind(Overlayer)
  Overlayer.outline = (rects: unknown, options: OutlineOptions = {}) => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--color-focus')
    return outline(rects, { color: color.trim() || undefined, width: 2, ...options })
  }
}
