/*
 * Design brief (refactoring-ui Workflow B), search in book.
 *
 * Feature: find a passage. Content, by rank:
 *   primary    the query field, focused on open
 *   secondary  matches: the matched words emphasised inside a line of context
 *   tertiary   the chapter each match is in (a small muted heading), the count and progress
 * Results stay while the sheet is closed, so the reader can step from one match to the next.
 * Tokens: excerpts 14px fg-secondary with the match in fg semibold on action-subtle; chapter
 * headings 12px semibold fg-muted.
 */

import type { SearchEvent, SearchMatch } from 'foliate-js/view.js'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@/ui/Sheet'

interface SearchSheetProps {
  open: boolean
  onClose(): void
  search(query: string): AsyncGenerator<SearchEvent>
  clear(): void
  onSelect(cfi: string): void
}

interface Group {
  label: string
  matches: SearchMatch[]
}

type Status =
  | { name: 'idle' }
  | { name: 'searching'; progress: number }
  | { name: 'done' }
  | { name: 'failed' }

const count = new Intl.NumberFormat()
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })

// One Latin letter matches nearly every line; one CJK character is a word.
const searchable = (query: string) => query.length >= 2 || /[^\p{Script=Latin}\p{N}\s]/u.test(query)

export function SearchSheet({ open, onClose, search, clear, onSelect }: SearchSheetProps) {
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [status, setStatus] = useState<Status>({ name: 'idle' })
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef({ search, clear })
  latest.current = { search, clear }

  // A search starts once typing pauses; a newer query abandons the one in progress.
  useEffect(() => {
    const text = query.trim()
    if (!searchable(text)) {
      latest.current.clear()
      setGroups([])
      setStatus({ name: 'idle' })
      return
    }
    let abandoned = false
    const timer = setTimeout(async () => {
      setGroups([])
      setStatus({ name: 'searching', progress: 0 })
      try {
        // Leaving the loop early (break or return) stops the generator.
        for await (const event of latest.current.search(text)) {
          if (abandoned) return
          if (event === 'done') break
          if ('progress' in event) {
            setStatus({ name: 'searching', progress: event.progress })
          } else if ('subitems' in event) {
            const group = { label: event.label, matches: event.subitems }
            setGroups((previous) => [...previous, group])
          }
        }
        if (!abandoned) setStatus({ name: 'done' })
      } catch (error) {
        console.error('search failed', error)
        if (!abandoned) setStatus({ name: 'failed' })
      }
    }, 400)
    return () => {
      abandoned = true
      clearTimeout(timer)
    }
  }, [query])

  const total = groups.reduce((sum, group) => sum + group.matches.length, 0)
  let summary = ''
  if (status.name === 'searching') summary = `Searching… ${percent.format(status.progress)}`
  else if (status.name === 'failed') summary = 'The search stopped because of an error.'
  else if (status.name === 'done') {
    summary =
      total === 0
        ? `No matches for “${query.trim()}”`
        : `${count.format(total)} ${total === 1 ? 'match' : 'matches'}`
  }

  return (
    <Sheet
      open={open}
      title="Search"
      side="end"
      onClose={onClose}
      onOpened={() => {
        input.current?.focus()
        input.current?.select()
      }}
    >
      <div className="px-6">
        <label className="input w-full bg-surface-sunken">
          <Search aria-hidden className="size-4 text-fg-muted" />
          <input
            ref={input}
            type="search"
            placeholder="Search this book"
            aria-label="Search this book"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="mt-3 h-4 text-xs text-fg-muted" role="status">
          {summary}
        </p>
      </div>
      <div className="mt-4">
        {groups.map((group, groupIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: groups only ever append
          <section key={groupIndex} className="pb-4">
            {group.label && (
              <h3 className="truncate px-6 py-2 text-xs font-semibold text-fg-muted">
                {group.label.trim()}
              </h3>
            )}
            <ul>
              {group.matches.map((match) => (
                <li key={match.cfi}>
                  <button
                    type="button"
                    className="block w-full px-6 py-2 text-start text-sm leading-normal text-fg-secondary hover:bg-surface-hover focus-visible:-outline-offset-2"
                    onClick={() => onSelect(match.cfi)}
                  >
                    {match.excerpt.pre}
                    <mark className="rounded-sm bg-action-subtle font-semibold text-fg">
                      {match.excerpt.match}
                    </mark>
                    {match.excerpt.post}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}
