/**
 * Choosing books in the library's selection mode. A click toggles one book; a click with Shift
 * gives every book from the last one clicked through this one the state this one takes, as in
 * a file manager.
 */
export function toggleSelection({
  selected,
  order,
  id,
  anchor,
  range,
}: {
  selected: ReadonlySet<string>
  /** The books as shown, in order. */
  order: readonly string[]
  id: string
  /** The book clicked last, where a range starts. */
  anchor: string | null
  /** Whether Shift was held. */
  range: boolean
}): Set<string> {
  const next = new Set(selected)
  const select = !selected.has(id)
  const from = anchor === null ? -1 : order.indexOf(anchor)
  const to = order.indexOf(id)
  const ids =
    range && from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
  for (const each of ids) {
    if (select) next.add(each)
    else next.delete(each)
  }
  return next
}
