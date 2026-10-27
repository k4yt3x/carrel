import type { TocItem } from 'foliate-js/view.js'

/**
 * Keys for the entries of a table of contents: the path of positions from the top, such as
 * "2.0.1". Hrefs repeat in some books, and a table of contents never reorders, so positions
 * name its entries.
 */
export const childKey = (parent: string, index: number) =>
  parent === '' ? String(index) : `${parent}.${index}`

/**
 * The keys of the entries that hold `target`, outermost first: those to open for it to show.
 * Empty when `target` isn't there, or it is at the top. Entries are told apart by identity:
 * a part and its first chapter can share an href.
 */
export function pathTo(
  items: readonly TocItem[],
  target: TocItem | undefined,
  parent = '',
): string[] {
  if (target === undefined) return []
  for (const [index, item] of items.entries()) {
    const key = childKey(parent, index)
    if (item === target) return []
    if (item.subitems?.length) {
      const inner = pathTo(item.subitems, target, key)
      if (inner.length > 0 || item.subitems.includes(target)) return [key, ...inner]
    }
  }
  return []
}

/** Every entry of a table of contents, in reading order, sections before what they hold. */
export function flattenToc(items: readonly TocItem[]): TocItem[] {
  return items.flatMap((item) => [item, ...flattenToc(item.subitems ?? [])])
}

/** An entry that leads somewhere, unlike a heading that only holds others. */
export type Chapter = TocItem & { href: string }

const leads = (item: TocItem): item is Chapter => Boolean(item.href)

/**
 * The entries to step to from the one being read, in reading order: the one before it and the
 * one after that lead somewhere. Before the first entry (a cover, say), the next is the first.
 */
export function adjacentChapters(
  entries: readonly TocItem[],
  current: TocItem | undefined,
): { previous: Chapter | undefined; next: Chapter | undefined } {
  const at = current ? entries.indexOf(current) : -1
  return {
    previous: at > 0 ? entries.slice(0, at).findLast(leads) : undefined,
    next: entries.slice(at + 1).find(leads),
  }
}
