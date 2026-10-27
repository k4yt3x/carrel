import { useLayoutEffect, useSyncExternalStore } from 'react'
import type { Theme } from '@/domain/settings'
import { useAppSettings } from '@/store/appSettings'

const darkQuery = '(prefers-color-scheme: dark)'

const subscribeToScheme = (onChange: () => void) => {
  const query = window.matchMedia(darkQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const systemPrefersDark = () => window.matchMedia(darkQuery).matches

/** Whether a theme draws light text on a dark page, which decides how book colours are treated. */
export function schemeOf(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme === 'dark' ? 'dark' : 'light'
}

/** The theme the reader chose, and the colour scheme it comes to now. */
export function useTheme(): { theme: Theme; scheme: 'light' | 'dark' } {
  const theme = useAppSettings((state) => state.theme)
  const prefersDark = useSyncExternalStore(subscribeToScheme, systemPrefersDark)
  return { theme, scheme: schemeOf(theme, prefersDark) }
}

/**
 * Applies the chosen theme to the document: the `data-theme` attribute the generated theme
 * CSS keys on (public/theme-boot.js sets it before the first paint) and the browser's
 * theme-color, which tints the title bar of an installed app.
 *
 * A layout effect, so the attribute is in place before any component's ordinary effects run:
 * the reader reads the theme's colours from the document to style book pages.
 */
export function useThemeEffect(): void {
  const { theme, scheme } = useTheme()
  // biome-ignore lint/correctness/useExhaustiveDependencies: under the system theme the surface colour read inside changes with the scheme
  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    const surface = getComputedStyle(root).getPropertyValue('--color-surface').trim()
    // index.html declares one theme-color per system scheme; a pinned theme sets both.
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = surface
    }
  }, [theme, scheme])
}
