/**
 * The CSS carrel puts into every book page. foliate-js inserts it twice per document: the
 * first string before the book's own styles, as defaults the book may override, and the
 * second after them, for what the reader's settings and theme have to decide.
 *
 * Book pages are documents of their own, so nothing from the app's stylesheet reaches them:
 * colours, font stacks and font faces are all passed in as values.
 */

import type { ReadingSettings } from '@/domain/settings'

export interface PageTheme {
  scheme: 'light' | 'dark'
  background: string
  foreground: string
  link: string
}

export interface PageStyleInput {
  theme: PageTheme
  settings: ReadingSettings
  /** CSS font-family for the chosen typeface, or null to keep the book's own fonts. */
  fontFamily: string | null
  /** The @font-face rules the chosen typeface needs, since pages can't see the app's. */
  fontFaces: string
}

/** The page colours, read from the app's semantic tokens so pages match the app's theme. */
export function currentPageTheme(scheme: 'light' | 'dark'): PageTheme {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()
  return {
    scheme,
    background: token('--color-surface'),
    foreground: token('--color-fg'),
    link: token('--color-action-fg'),
  }
}

/** The font stacks behind the Serif and Sans typefaces, from the design tokens. */
export function systemFontStacks(): { serif: string; sans: string } {
  const style = getComputedStyle(document.documentElement)
  return {
    serif: style.getPropertyValue('--font-serif').trim() || 'serif',
    sans: style.getPropertyValue('--font-sans').trim() || 'sans-serif',
  }
}

// Body text: the elements whose spacing and alignment the settings take over. Headings,
// tables and preformatted text keep the book's own.
const prose = 'p, li, blockquote, dd, dt'

const defaults = `
@namespace epub "http://www.idpf.org/2007/ops";
p, li, blockquote, dd {
  hanging-punctuation: allow-end last;
  widows: 2;
  orphans: 2;
}
pre {
  white-space: pre-wrap;
}
`

function colors({ scheme, background, foreground, link }: PageTheme, recolor: boolean): string {
  // The page background is painted by the paginator behind the page, from
  // --theme-bg-color; a background on <html> would cover the running heads and feet,
  // which sit in the margins behind the page document. The paginator otherwise paints the
  // colour a book gives its <body> (often white); --override-color makes it use the
  // theme's, keeping any background image, so a sepia page stays sepia.
  const base = `
html {
  color-scheme: ${scheme};
  --theme-bg-color: ${background};
  --override-color: true;
  color: ${foreground};
}
a:any-link {
  color: ${link};
}
`
  if (!recolor) return base
  return `${base}
body, body * {
  color: inherit !important;
  background-color: transparent !important;
  border-color: currentColor !important;
}
a:any-link, a:any-link * {
  color: ${link} !important;
}
`
}

function typography(settings: ReadingSettings, fontFamily: string | null): string {
  const rules = [
    // On <html> so that the book's relative sizes (em, rem, %) scale with it.
    `html { font-size: ${settings.fontSize}px !important; }`,
    `html, ${prose} { line-height: ${settings.lineHeight} !important; }`,
    `${prose} { hyphens: ${settings.hyphenate ? 'auto' : 'manual'} !important; }`,
  ]
  if (fontFamily) {
    // Code keeps its monospace face; maths and drawings keep theirs.
    rules.push(
      `body { font-family: ${fontFamily} !important; }`,
      `body *:not(pre, code, kbd, samp, tt, pre *, code *, math, math *, svg, svg *) {
  font-family: inherit !important;
}`,
    )
  }
  if (settings.textAlign !== 'book') {
    rules.push(`${prose} { text-align: ${settings.textAlign} !important; }`)
  }
  if (settings.paragraphs === 'indented') {
    rules.push(
      `p { text-indent: 1.5em !important; margin-block: 0 !important; }`,
      // As in print, a paragraph that opens a chapter or follows a break isn't indented.
      `:is(h1, h2, h3, h4, h5, h6, hr, header) + p, body > p:first-child { text-indent: 0 !important; }`,
    )
  } else if (settings.paragraphs === 'spaced') {
    rules.push(`p { text-indent: 0 !important; margin-block: 0 0.75em !important; }`)
  }
  if (settings.letterSpacing !== 0) {
    rules.push(`body { letter-spacing: ${settings.letterSpacing}em !important; }`)
  }
  if (settings.wordSpacing !== 0) {
    rules.push(`body { word-spacing: ${settings.wordSpacing}em !important; }`)
  }
  return rules.join('\n')
}

export function pageStyles({
  theme,
  settings,
  fontFamily,
  fontFaces,
}: PageStyleInput): [string, string] {
  // A dark page can't keep a book's black text, so dark themes always take colours over.
  const recolor = theme.scheme === 'dark' || !settings.keepBookColors
  const after = [
    fontFaces,
    colors(theme, recolor),
    typography(settings, fontFamily),
    // Last, so that the reader's own CSS has the final word.
    settings.customCss,
  ]
  return [defaults, after.filter(Boolean).join('\n')]
}
