/**
 * The CSS carrel puts into every book page. foliate-js inserts it twice per document: the
 * first string before the book's own styles, as defaults the book may override, and the
 * second after them, for what the reader's theme has to decide.
 */

export interface PageTheme {
  scheme: 'light' | 'dark'
  background: string
  foreground: string
  link: string
}

const darkScheme = '(prefers-color-scheme: dark)'

export const colorSchemeQuery = () => window.matchMedia(darkScheme)

/**
 * The page colours, read from the app's semantic tokens so that book pages follow the same
 * theme as everything around them.
 */
export function currentPageTheme(): PageTheme {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()
  return {
    scheme: colorSchemeQuery().matches ? 'dark' : 'light',
    background: token('--color-surface'),
    foreground: token('--color-fg'),
    link: token('--color-action-fg'),
  }
}

const defaults = `
@namespace epub "http://www.idpf.org/2007/ops";
html {
  font-size: 18px;
}
p, li, blockquote, dd {
  line-height: 1.6;
  -webkit-hyphens: auto;
  hyphens: auto;
  hanging-punctuation: allow-end last;
  widows: 2;
  orphans: 2;
}
pre {
  white-space: pre-wrap;
}
`

/**
 * Books are typeset for paper, so in the light scheme their own colours are kept. A book
 * that sets black text would be unreadable on the dark page, so the dark scheme takes the
 * colours over entirely; links keep a colour of their own.
 */
function theme({ scheme, background, foreground, link }: PageTheme): string {
  // The page background is painted by the paginator behind the page, from
  // --theme-bg-color; a background on <html> would cover the running heads and feet,
  // which sit in the margins behind the page document.
  const base = `
html {
  color-scheme: ${scheme};
  --theme-bg-color: ${background};
  color: ${foreground};
}
a:any-link {
  color: ${link};
}
`
  if (scheme === 'light') return base
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

export function pageStyles(pageTheme: PageTheme): [string, string] {
  return [defaults, theme(pageTheme)]
}
