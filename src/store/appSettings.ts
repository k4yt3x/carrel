import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  defaultReadingSettings,
  isTheme,
  normalizeReadingSettings,
  type ReadingSettings,
  type Theme,
} from '@/domain/settings'

/** The persisted part of the app settings; also what a backup carries as preferences. */
export interface Preferences {
  theme: Theme
  /** The reading settings every book uses unless it has its own. */
  reading: ReadingSettings
}

interface AppSettingsState extends Preferences {
  setTheme(theme: Theme): void
  setReading(reading: ReadingSettings): void
  /** Replaces everything, as restoring a backup does. */
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
}

/** Turns stored or restored data into preferences, keeping whatever is valid. */
export function normalizePreferences(raw: unknown): Preferences {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    theme: isTheme(value.theme) ? value.theme : defaultPreferences.theme,
    reading: normalizeReadingSettings(value.reading),
  }
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set) => ({
      ...defaultPreferences,
      setTheme: (theme) => set({ theme }),
      setReading: (reading) => set({ reading }),
      setPreferences: (preferences) => set(preferences),
    }),
    {
      name: appSettingsKey,
      version: 1,
      partialize: ({ theme, reading }) => ({ theme, reading }),
      // localStorage is outside the app's control, and the settings gain fields over time.
      merge: (persisted, current) => ({ ...current, ...normalizePreferences(persisted) }),
    },
  ),
)

/** The preferences as they stand, for a backup. */
export function currentPreferences(): Preferences {
  const { theme, reading } = useAppSettings.getState()
  return { theme, reading }
}
