import type { TocItem } from 'foliate-js/view.js'
import { describe, expect, it } from 'vitest'
import { adjacentChapters, childKey, flattenToc, pathTo } from '@/ui/reader/tocTree'

const toc: TocItem[] = [
  { label: 'Cover', href: 'cover' },
  {
    label: 'Part One',
    href: 'part1',
    subitems: [
      { label: 'Chapter 1', href: 'ch1' },
      { label: 'Chapter 2', href: 'ch2', subitems: [{ label: 'Section 2.1', href: 'ch2.1' }] },
    ],
  },
  { label: 'Part Two', href: 'part2', subitems: [{ label: 'Chapter 3', href: 'ch3' }] },
]

const entry = (href: string) => {
  const found = flattenToc(toc).find((item) => item.href === href)
  if (!found) throw new Error(`no entry ${href}`)
  return found
}

describe('pathTo', () => {
  it('names the entries that hold the current one, outermost first', () => {
    expect(pathTo(toc, entry('ch2.1'))).toEqual(['1', '1.1'])
    expect(pathTo(toc, entry('ch3'))).toEqual(['2'])
  })

  it('opens nothing for an entry at the top, or one that is not there', () => {
    expect(pathTo(toc, entry('part1'))).toEqual([])
    expect(pathTo(toc, { label: 'Elsewhere', href: 'part1' })).toEqual([])
    expect(pathTo(toc, undefined)).toEqual([])
  })
})

describe('adjacentChapters', () => {
  // A heading that links nowhere, between two chapters.
  const parts: TocItem[] = [
    { label: 'One', href: 'one' },
    { label: 'Part Two', href: null, subitems: [{ label: 'Two', href: 'two' }] },
  ]
  const [one, heading, two] = flattenToc(parts)

  it('steps over headings that lead nowhere', () => {
    expect(adjacentChapters(flattenToc(parts), one)).toEqual({ previous: undefined, next: two })
    expect(adjacentChapters(flattenToc(parts), two)).toEqual({ previous: one, next: undefined })
    expect(adjacentChapters(flattenToc(parts), heading)).toEqual({ previous: one, next: two })
  })

  it('goes to the first chapter from before it', () => {
    expect(adjacentChapters(flattenToc(parts), undefined)).toEqual({
      previous: undefined,
      next: one,
    })
  })
})

describe('childKey', () => {
  it('extends the parent’s path', () => {
    expect(childKey('', 2)).toBe('2')
    expect(childKey('1.0', 3)).toBe('1.0.3')
  })
})

describe('flattenToc', () => {
  it('lists every entry in reading order', () => {
    expect(flattenToc(toc).map((item) => item.href)).toEqual([
      'cover',
      'part1',
      'ch1',
      'ch2',
      'ch2.1',
      'part2',
      'ch3',
    ])
  })
})
