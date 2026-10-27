import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { useEffect } from 'react'
import type { ImportOutcome } from '@/domain/library'
import { useImports } from '@/store/imports'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** One sentence per kind of result, most important first. */
function summarize({ added, duplicates, failed }: ImportOutcome): string[] {
  const lines: string[] = []
  if (failed.length > 0) {
    lines.push(
      failed.length === 1
        ? `“${failed[0]?.fileName}” couldn’t be added.`
        : `${plural(failed.length, 'file', 'files')} couldn’t be added.`,
    )
  }
  if (added.length > 0) {
    lines.push(
      added.length === 1
        ? `Added “${added[0]?.title}”.`
        : `Added ${plural(added.length, 'book', 'books')}.`,
    )
  }
  if (duplicates.length > 0) {
    lines.push(
      duplicates.length === 1
        ? `“${duplicates[0]?.title}” is already in your library.`
        : `${plural(duplicates.length, 'book was', 'books were')} already in your library.`,
    )
  }
  return lines
}

const shownFailures = 3
const autoDismissMs = 6000

/** Reports an import as it runs and how it went. Failures stay until dismissed. */
export function ImportNotice() {
  const notice = useImports((state) => state.notice)
  const dismiss = useImports((state) => state.dismiss)
  const settled = notice?.kind === 'result' && notice.outcome.failed.length === 0

  useEffect(() => {
    if (!settled) return
    const timer = setTimeout(dismiss, autoDismissMs)
    return () => clearTimeout(timer)
  }, [settled, dismiss])

  if (!notice) return null

  let body: React.ReactNode
  if (notice.kind === 'progress') {
    body = (
      <div role="status" className="flex items-center gap-3">
        <span className="loading loading-spinner loading-sm text-action-fg" aria-hidden />
        <p className="text-sm text-fg">
          Adding books…{' '}
          {notice.total > 1 && (
            <span className="text-fg-muted">
              {Math.min(notice.done + 1, notice.total)} of {notice.total}
            </span>
          )}
        </p>
      </div>
    )
  } else {
    const { failed } = notice.outcome
    const hasFailures = failed.length > 0
    const [headline, ...rest] = summarize(notice.outcome)
    const Icon = hasFailures ? CircleAlert : CircleCheck
    body = (
      <div role={hasFailures ? 'alert' : 'status'} className="flex items-start gap-3">
        <span className="flex h-[1lh] items-center text-sm">
          <Icon
            aria-hidden
            className={`size-4 shrink-0 ${hasFailures ? 'text-danger-fg' : 'text-action-fg'}`}
          />
        </span>
        <div className="min-w-0 flex-1 text-sm break-words">
          <p className="font-semibold text-fg">{headline}</p>
          {hasFailures && (
            <ul className="mt-2 space-y-1 text-fg-secondary">
              {failed.slice(0, shownFailures).map((failure, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: two files can share a name, and the list never changes order
                <li key={`${index}-${failure.fileName}`}>
                  {failed.length > 1 && <span className="text-fg">{failure.fileName}: </span>}
                  {failure.reason}
                </li>
              ))}
              {failed.length > shownFailures && (
                <li className="text-fg-muted">
                  and {plural(failed.length - shownFailures, 'other', 'others')}
                </li>
              )}
            </ul>
          )}
          {rest.map((line) => (
            <p key={line} className="mt-2 text-fg-secondary">
              {line}
            </p>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square -my-2 -me-2 text-fg-muted"
          aria-label="Dismiss"
          data-tooltip=""
          onClick={dismiss}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    )
  }

  return <div className="rounded-lg bg-surface-raised p-4 shadow-xl">{body}</div>
}
