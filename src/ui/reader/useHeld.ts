import { useRef, useState } from 'react'

/**
 * A saved setting that a drag changes: the page follows every step of the drag, and the
 * setting is saved once, when the drag lets go. Saving writes all the settings to
 * localStorage, and every other open tab reads them back, so saving each step would do that
 * many times a second. A change made without holding (a key, a typed value) is saved at once.
 */
export function useHeld<T>(saved: T, save: (value: T) => void) {
  const [held, setHeld] = useState<{ value: T } | null>(null)
  const holding = useRef(false)
  const moved = useRef<{ value: T } | null>(null)
  const change = (value: T) => {
    if (!holding.current) {
      save(value)
      return
    }
    moved.current = { value }
    setHeld({ value })
  }
  const hold = (on: boolean) => {
    holding.current = on
    if (on) return
    const last = moved.current
    moved.current = null
    if (last) save(last.value)
    setHeld(null)
  }
  return { value: held ? held.value : saved, change, hold }
}
