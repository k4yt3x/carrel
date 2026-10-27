/**
 * Turns design/design-tokens.json into the CSS the app and the design docs consume:
 *
 * - src/styles/theme.css: the Tailwind v4 theme. It resets Tailwind's own scales first so
 *   that only the system's values exist as utilities, then declares primitives, then the
 *   semantic layer (light), then the dark remap of the semantic layer.
 * - design/tokens.css: the same tokens as framework-neutral custom properties.
 *
 * Semantic tokens reference primitives with var() rather than repeating hex values, so a
 * primitive has exactly one definition and the dark remap only names different primitives.
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

const primitives = flatten(tokens.primitive)
const light = flatten(tokens.semantic)
const dark = flatten(tokens['semantic-dark'])
const defined = new Set(primitives.map(([name]) => name))
checkReferences(light, defined)
checkReferences(dark, defined)

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

// `static` emits every variable whether or not a utility uses it: the dark remap and the
// reader (which reads computed values to style book pages) both refer to them.
const theme = `${header}
@theme static {
${resets.map((line) => `  ${line}`).join('\n')}

${declare(primitives, '  ')}

${declare(light, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root {
${declare(dark, '    ')}
  }
}
`

const neutral = `${header}
:root {
${declare(primitives, '  ')}

${declare(light, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root {
${declare(dark, '    ')}
  }
}
`

writeFileSync(new URL('src/styles/theme.css', root), theme)
writeFileSync(new URL('design/tokens.css', root), neutral)
console.error(`wrote ${fileURLToPath(new URL('src/styles/theme.css', root))}`)
console.error(`wrote ${fileURLToPath(new URL('design/tokens.css', root))}`)
