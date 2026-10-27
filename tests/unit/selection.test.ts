import { describe, expect, it } from 'vitest'
import { toggleSelection } from '@/ui/library/selection'

const order = ['a', 'b', 'c', 'd', 'e']
const none = new Set<string>()

describe('toggleSelection', () => {
  it('toggles one book', () => {
    const one = toggleSelection({ selected: none, order, id: 'b', anchor: null, range: false })
    expect([...one]).toEqual(['b'])
    expect([
      ...toggleSelection({ selected: one, order, id: 'b', anchor: 'b', range: false }),
    ]).toEqual([])
  })

  it('selects every book between the last one clicked and this one, either way', () => {
    const from = new Set(['b'])
    expect(
      [...toggleSelection({ selected: from, order, id: 'd', anchor: 'b', range: true })].sort(),
    ).toEqual(['b', 'c', 'd'])
    expect(
      [
        ...toggleSelection({ selected: new Set(['d']), order, id: 'a', anchor: 'd', range: true }),
      ].sort(),
    ).toEqual(['a', 'b', 'c', 'd'])
  })

  it('clears a range when the book clicked was selected', () => {
    const all = new Set(order)
    expect(
      [...toggleSelection({ selected: all, order, id: 'd', anchor: 'b', range: true })].sort(),
    ).toEqual(['a', 'e'])
  })

  it('toggles one book when there is no range to take', () => {
    expect([
      ...toggleSelection({ selected: none, order, id: 'c', anchor: null, range: true }),
    ]).toEqual(['c'])
    // The last book clicked has since been filtered out of view.
    expect([
      ...toggleSelection({ selected: none, order, id: 'c', anchor: 'z', range: true }),
    ]).toEqual(['c'])
  })
})
