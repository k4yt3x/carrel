import { useLayoutEffect, useSyncExternalStore } from 'react'
import type { Theme } from '@/domain/settings'
import { type CustomTheme, customThemeId, schemeOfBackground } from '@/domain/themes'
import { useAppSettings } from '@/store/appSettings'

const darkQuery = '(prefers-color-scheme: dark)'

const subscribeToScheme = (onChange: () => void) => {
  const query = window.matchMedia(darkQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const systemPrefersDark = () => window.matchMedia(darkQuery).matches

/** Whether a theme draws light text on a dark page, which decides how book colours are treated. */
export function schemeOf(
  theme: Theme,
  prefersDark: boolean,
  custom: CustomTheme | null = null,
): 'light' | 'dark' {
  if (custom) return schemeOfBackground(custom.background)
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme === 'dark' ? 'dark' : 'light'
}

interface ThemeState {
  theme: Theme
  scheme: 'light' | 'dark'
  /** The custom theme in use, if the theme is one the reader made. */
  custom: CustomTheme | null
  /**
   * Changes whenever the colours do, including when a custom theme in use is edited, for
   * anything that has to repaint with them.
   */
  palette: string
}

/** The theme the reader chose, and the colour scheme it comes to now. */
export function useTheme(): ThemeState {
  const theme = useAppSettings((state) => state.theme)
  const customThemes = useAppSettings((state) => state.customThemes)
  const prefersDark = useSyncExternalStore(subscribeToScheme, systemPrefersDark)
  const id = customThemeId(theme)
  const custom = (id && customThemes.find((candidate) => candidate.id === id)) || null
  const scheme = schemeOf(theme, prefersDark, custom)
  const palette = custom
    ? `${theme}:${custom.background}:${custom.text}:${custom.link}`
    : `${theme}:${scheme}`
  return { theme, scheme, custom, palette }
}

const customProperties = {
  background: '--custom-background',
  text: '--custom-text',
  link: '--custom-link',
} as const

/**
 * Applies the chosen theme to the document: the `data-theme` attribute the generated theme
 * CSS keys on, and for a custom theme its colours and `data-scheme`; and the browser's
 * theme-color, which tints the title bar of an installed app. public/theme-boot.js does the
 * same before the first paint.
 *
 * A layout effect, so the attribute is in place before any component's ordinary effects run:
 * the reader reads the theme's colours from the document to style book pages.
 */
export function useThemeEffect(): void {
  const { theme, scheme, custom, palette } = useTheme()
  // biome-ignore lint/correctness/useExhaustiveDependencies: the palette covers the theme, its scheme and a custom theme's colours, all of which change the surface read inside
  useLayoutEffect(() => {
    const root = document.documentElement
    for (const property of Object.values(customProperties)) root.style.removeProperty(property)
    delete root.dataset.scheme
    if (custom) {
      root.dataset.theme = 'custom'
      root.dataset.scheme = scheme
      for (const [key, property] of Object.entries(customProperties)) {
        root.style.setProperty(property, custom[key as keyof typeof customProperties])
      }
    } else if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    const surface = getComputedStyle(root).getPropertyValue('--color-surface').trim()
    // index.html declares one theme-color per system scheme; a pinned theme sets both.
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = surface
    }
  }, [palette])
}
