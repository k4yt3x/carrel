import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A control's own copy of a value while the reader is changing it.
 *
 * Every change to a reading setting lays the book out again, which can take longer than the
 * gap between two pointer events, and a per-book setting comes back from IndexedDB only after
 * a round trip. A control drawn straight from the setting would then lag behind a drag, or snap
 * back to the old value mid-drag. With a draft, the control follows the reader at once and the
 * setting changes once the movement pauses (`delay` ms) or ends (`commit`).
 *
 * The draft is dropped when the setting next changes with no edit waiting, so the committed
 * value, or a change made elsewhere (Reset, another tab), takes over.
 */
export function useDraft<T>(value: T, onChange: (value: T) => void, delay: number) {
  const [draft, setDraft] = useState<{ value: T } | null>(null)
  const pending = useRef<{ value: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef(onChange)
  latest.current = onChange

  const commit = useCallback(() => {
    clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    if (next) latest.current(next.value)
  }, [])

  const change = useCallback(
    (next: T) => {
      setDraft({ value: next })
      pending.current = { value: next }
      clearTimeout(timer.current)
      timer.current = setTimeout(commit, delay)
    },
    [commit, delay],
  )

  // Once no edit is waiting, the next value the setting takes (the committed one, or a change
  // made elsewhere) replaces the draft.
  const settled = useRef(value)
  useEffect(() => {
    if (pending.current === null && !Object.is(settled.current, value)) setDraft(null)
    settled.current = value
  }, [value])

  // An edit still waiting when the control goes away (the sheet closes) is kept, not lost.
  useEffect(() => commit, [commit])

  return { value: draft ? draft.value : value, change, commit }
}
