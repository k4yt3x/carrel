import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

/**
 * A database query kept up to date, like dexie-react-hooks' useLiveQuery, but taking up
 * changes at most once every `ms` while they keep coming. A single change shows at once; a
 * stream of them, such as an import adding a book every few milliseconds, shows a few times a
 * second rather than redrawing the page for each. The query is fixed for the component's life.
 */
export function useThrottledLiveQuery<T>(query: () => Promise<T>, ms: number): T | undefined {
  const [result, setResult] = useState<{ value: T } | { error: unknown }>()
  // biome-ignore lint/correctness/useExhaustiveDependencies: the query is fixed, as documented
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let waiting: { value: T } | null = null
    let shownAt = Number.NEGATIVE_INFINITY
    const show = () => {
      timer = undefined
      shownAt = performance.now()
      if (waiting) setResult(waiting)
      waiting = null
    }
    const subscription = liveQuery(query).subscribe({
      next: (value) => {
        waiting = { value }
        if (timer !== undefined) return
        const wait = shownAt + ms - performance.now()
        if (wait <= 0) show()
        else timer = setTimeout(show, wait)
      },
      error: (error: unknown) => setResult({ error }),
    })
    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [ms])
  // As useLiveQuery does, a failed query fails the component, for the error boundary.
  if (result && 'error' in result) throw result.error
  return result?.value
}
