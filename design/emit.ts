/**
 * Turns design/design-tokens.json into the CSS the app and the design docs consume:
 *
 * - src/styles/theme.css: the Tailwind v4 theme. It resets Tailwind's own scales first so
 *   that only the system's values exist as utilities, then declares primitives, then the
 *   semantic layer (light), then the remaps of the semantic layer for the other themes.
 * - design/tokens.css: the same tokens as framework-neutral custom properties.
 *
 * Semantic tokens reference primitives with var() rather than repeating hex values, so a
 * primitive has exactly one definition and a theme's remap only names different primitives.
 *
 * Themes: with no `data-theme` on the root element the page follows the system's colour
 * scheme; `data-theme="light"`, `"sepia"` or `"dark"` pins one. The app sets the attribute
 * from the reader's choice before the first paint (public/theme-boot.js).
 *
 * Run with `pnpm design:emit` after editing the JSON.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

type TokenTree = { [key: string]: string | TokenTree }

interface Tokens {
  primitive: TokenTree
  semantic: TokenTree
  'semantic-dark': TokenTree
  'semantic-sepia': TokenTree
}

const root = new URL('..', import.meta.url)
const tokens = JSON.parse(
  readFileSync(new URL('design/design-tokens.json', root), 'utf8'),
) as Tokens

const reference = /^\{([\w.-]+)\}$/

/** Flattens a token tree into `[name, value]` pairs, `{a.b}` references becoming `var(--a-b)`. */
function flatten(tree: TokenTree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}-${key}` : key
    if (typeof value !== 'string') return flatten(value, name)
    const match = reference.exec(value)
    return [[name, match ? `var(--${match[1]?.replaceAll('.', '-')})` : value]]
  })
}

/** Fails the run on a reference to a primitive that does not exist. */
function checkReferences(pairs: [string, string][], defined: Set<string>): void {
  for (const [name, value] of pairs) {
    const target = /^var\(--([\w-]+)\)$/.exec(value)?.[1]
    if (target && !defined.has(target)) {
      throw new Error(`${name} references undefined primitive --${target}`)
    }
  }
}

/** Fails the run when a theme leaves out a semantic token, which would leak the light value. */
function checkComplete(theme: string, pairs: [string, string][], light: [string, string][]) {
  const names = new Set(pairs.map(([name]) => name))
  const missing = light.map(([name]) => name).filter((name) => !names.has(name))
  if (missing.length > 0) throw new Error(`${theme} does not define ${missing.join(', ')}`)
}

const primitives = flatten(tokens.primitive)
const light = flatten(tokens.semantic)
const dark = flatten(tokens['semantic-dark'])
const sepia = flatten(tokens['semantic-sepia'])
const defined = new Set(primitives.map(([name]) => name))
for (const pairs of [light, dark, sepia]) checkReferences(pairs, defined)
checkComplete('semantic-dark', dark, light)
checkComplete('semantic-sepia', sepia, light)

const declare = (pairs: [string, string][], indent: string) =>
  pairs.map(([name, value]) => `${indent}--${name}: ${value};`).join('\n')

const header = `/*
 * Generated from design/design-tokens.json by design/emit.ts. Edit the JSON and run
 * \`pnpm design:emit\`; changes made here are overwritten.
 */
`

// Tailwind ships its own palette and scales. Clearing them leaves the system's values as the
// only ones a utility can name, so an off-system value has to be written out as an arbitrary
// value where review can see it. Breakpoints stay: the system adopts Tailwind's.
const resets = [
  '--color-*: initial;',
  '--font-*: initial;',
  '--text-*: initial;',
  '--font-weight-*: initial;',
  '--leading-*: initial;',
  '--spacing: initial;',
  '--radius-*: initial;',
  '--shadow-*: initial;',
  '--inset-shadow-*: initial;',
  '--drop-shadow-*: initial;',
]

// The light values sit in the base declaration; these blocks remap the semantic layer. Each
// pinned theme also pins `color-scheme`, so form controls and scrollbars match it rather than
// the system.
const themeBlocks = `:root {
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
${declare(dark, '    ')}
  }
}

:root[data-theme='light'] {
  color-scheme: light;
}

:root[data-theme='sepia'] {
  color-scheme: light;
${declare(sepia, '  ')}
}

:root[data-theme='dark'] {
  color-scheme: dark;
${declare(dark, '  ')}
}
`

// `static` emits every variable whether or not a utility uses it: the theme remaps and the
// reader (which reads computed values to style book pages) both refer to them.
const theme = `${header}
@theme static {
${resets.map((line) => `  ${line}`).join('\n')}

${declare(primitives, '  ')}

${declare(light, '  ')}
}

${themeBlocks}`

const neutral = `${header}
:root {
${declare(primitives, '  ')}

${declare(light, '  ')}
}

${themeBlocks}`

writeFileSync(new URL('src/styles/theme.css', root), theme)
writeFileSync(new URL('design/tokens.css', root), neutral)
console.error(`wrote ${fileURLToPath(new URL('src/styles/theme.css', root))}`)
console.error(`wrote ${fileURLToPath(new URL('design/tokens.css', root))}`)
