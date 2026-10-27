import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  defaultReadingSettings,
  isBuiltinTheme,
  normalizeReadingSettings,
  normalizeTextOffset,
  normalizeTocWidth,
  type ReadingSettings,
  type Theme,
  tocWidthLimits,
} from '@/domain/settings'
import {
  type CustomTheme,
  customThemeId,
  customThemeLimit,
  customThemeRef,
  normalizeCustomThemes,
} from '@/domain/themes'

/** The persisted part of the app settings; also what a backup carries as preferences. */
export interface Preferences {
  theme: Theme
  /** The reading settings every book uses unless it has its own. */
  reading: ReadingSettings
  /** Themes the reader made, in the order they were made. */
  customThemes: CustomTheme[]
}

interface AppSettingsState extends Preferences {
  /**
   * Pixels the text moves right of the window's centre; negative moves it left. It fits this
   * screen and browser rather than the reader, so it stays here and out of backups.
   */
  textOffset: number
  setTextOffset(offset: number): void
  /** The docked contents' width, in pixels; like the offset, it fits this screen. */
  tocWidth: number
  setTocWidth(width: number): void
  setTheme(theme: Theme): void
  setReading(reading: ReadingSettings): void
  /**
   * Adds a custom theme, or replaces the one with its id, and switches to it. A new theme
   * past the limit is refused (the picker offers none).
   */
  saveCustomTheme(theme: CustomTheme): void
  /** Removes a custom theme; if it was in use, the system theme takes over. */
  deleteCustomTheme(id: string): void
  /**
   * Takes a backup's preferences: its theme and reading settings replace these, and its custom
   * themes join the ones here (a theme with the same id stays as it is here).
   */
  setPreferences(preferences: Preferences): void
}

/**
 * The localStorage key. public/theme-boot.js reads the theme under the same key before the
 * app loads, so the first paint is already in the reader's theme.
 */
export const appSettingsKey = 'carrel.app-settings'

export const defaultPreferences: Preferences = {
  theme: 'system',
  reading: defaultReadingSettings,
  customThemes: [],
}

/** A theme setting that names a built-in theme or one of these custom themes. */
function validTheme(theme: unknown, customThemes: readonly CustomTheme[]): Theme {
  if (isBuiltinTheme(theme)) return theme
  const id = typeof theme === 'string' ? customThemeId(theme) : null
  return id && customThemes.some((custom) => custom.id === id)
    ? customThemeRef(id)
    : defaultPreferences.theme
}

/** Turns stored or restored data into preferences, keeping whatever is valid. */
export function normalizePreferences(raw: unknown): Preferences {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const customThemes = normalizeCustomThemes(value.customThemes)
  return {
    theme: validTheme(value.theme, customThemes),
    reading: normalizeReadingSettings(value.reading),
    customThemes,
  }
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set) => ({
      ...defaultPreferences,
      textOffset: 0,
      setTextOffset: (offset) => set({ textOffset: normalizeTextOffset(offset) }),
      tocWidth: tocWidthLimits.default,
      setTocWidth: (width) => set({ tocWidth: normalizeTocWidth(width) }),
      setTheme: (theme) => set({ theme }),
      setReading: (reading) => set({ reading }),
      saveCustomTheme: (theme) =>
        set((state) => {
          const { customThemes } = state
          const exists = customThemes.some((custom) => custom.id === theme.id)
          if (!exists && customThemes.length >= customThemeLimit) return state
          const next = exists
            ? customThemes.map((custom) => (custom.id === theme.id ? theme : custom))
            : [...customThemes, theme]
          return { customThemes: next, theme: customThemeRef(theme.id) }
        }),
      deleteCustomTheme: (id) =>
        set(({ customThemes, theme }) => ({
          customThemes: customThemes.filter((custom) => custom.id !== id),
          theme: theme === customThemeRef(id) ? 'system' : theme,
        })),
      setPreferences: (preferences) =>
        set(({ customThemes }) => {
          const known = new Set(customThemes.map((custom) => custom.id))
          const merged = [
            ...customThemes,
            ...preferences.customThemes.filter((custom) => !known.has(custom.id)),
          ].slice(0, customThemeLimit)
          return {
            reading: preferences.reading,
            customThemes: merged,
            theme: validTheme(preferences.theme, merged),
          }
        }),
    }),
    {
      name: appSettingsKey,
      version: 1,
      partialize: ({ theme, reading, customThemes, textOffset, tocWidth }) => ({
        theme,
        reading,
        customThemes,
        textOffset,
        tocWidth,
      }),
      // localStorage is outside the app's control, and the settings gain fields over time.
      merge: (persisted, current) => ({
        ...current,
        ...normalizePreferences(persisted),
        textOffset: normalizeTextOffset((persisted as { textOffset?: unknown } | null)?.textOffset),
        tocWidth: normalizeTocWidth((persisted as { tocWidth?: unknown } | null)?.tocWidth),
      }),
    },
  ),
)

// Every change writes the whole state, so a tab that missed another tab's change (a theme
// made there) would write over it with its next one. Each tab takes up the other's changes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === appSettingsKey) {
      useAppSettings.persist
        .rehydrate()
        ?.catch((error: unknown) => console.error('could not read the app settings', error))
    }
  })
}

/** The preferences as they stand, for a backup. */
export function currentPreferences(): Preferences {
  const { theme, reading, customThemes } = useAppSettings.getState()
  return { theme, reading, customThemes }
}
