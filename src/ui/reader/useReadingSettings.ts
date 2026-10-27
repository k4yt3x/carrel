import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/domain/db'
import { normalizeReadingSettings, type ReadingSettings } from '@/domain/settings'
import { useAppSettings } from '@/store/appSettings'

/** Whether a change applies to every book or to this one alone. */
export type SettingsScope = 'all' | 'book'

export interface ReadingSettingsControl {
  /** The settings in effect for the book; undefined until its own settings have been looked up. */
  settings: ReadingSettings | undefined
  scope: SettingsScope
  update(settings: ReadingSettings): void
  /**
   * Switching to 'book' gives the book a copy of the shared settings to change; switching back
   * to 'all' discards the copy.
   */
  setScope(scope: SettingsScope): void
}

/**
 * A book's reading settings: its own when it has them, otherwise the shared ones. `onSaved`
 * hears whether a change was saved: one that wasn't doesn't take effect.
 */
export function useReadingSettings(
  bookId: string,
  onSaved: (error: unknown) => void,
): ReadingSettingsControl {
  const shared = useAppSettings((state) => state.reading)
  const setShared = useAppSettings((state) => state.setReading)
  // null once looked up and absent, so "none" and "not loaded yet" stay distinguishable.
  const own = useLiveQuery(async () => {
    const record = await db.bookSettings.get(bookId)
    return record ? normalizeReadingSettings(record.settings) : null
  }, [bookId])

  const scope: SettingsScope = own ? 'book' : 'all'
  const saved = (write: Promise<unknown>) => {
    write.then(() => onSaved(null), onSaved)
  }
  return {
    settings: own === undefined ? undefined : (own ?? shared),
    scope,
    update(settings) {
      if (scope === 'book') saved(db.bookSettings.put({ id: bookId, settings }))
      else setShared(settings)
    },
    setScope(next) {
      if (next === scope) return
      if (next === 'book') saved(db.bookSettings.put({ id: bookId, settings: shared }))
      else saved(db.bookSettings.delete(bookId))
    },
  }
}
