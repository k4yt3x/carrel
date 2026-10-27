// Applies the reader's chosen theme before the first paint, so a page pinned to a theme does
// not flash the system's while the app loads. It runs as a classic script in <head>; the app
// keeps the theme up to date afterwards (src/ui/useTheme.ts). The key and shape are those of
// the persisted app settings store (src/store/appSettings.ts); the light-or-dark rule for a
// custom theme is schemeOfBackground in src/domain/themes.ts, and the two must agree.
try {
  const state = JSON.parse(localStorage.getItem('carrel.app-settings') ?? 'null')?.state
  const theme = state?.theme
  const root = document.documentElement
  const hex = /^#[0-9a-f]{6}$/i
  if (theme === 'light' || theme === 'dark') {
    root.dataset.theme = theme
  } else if (typeof theme === 'string' && theme.startsWith('custom:')) {
    const id = theme.slice('custom:'.length)
    const custom = (state?.customThemes ?? []).find((candidate) => candidate?.id === id)
    if (custom && [custom.background, custom.text, custom.link].every((c) => hex.test(c))) {
      const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      const [r, g, b] = [1, 3, 5].map((i) =>
        linear(Number.parseInt(custom.background.slice(i, i + 2), 16) / 255),
      )
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
      root.dataset.theme = 'custom'
      root.dataset.scheme = luminance > 0.18 ? 'light' : 'dark'
      root.style.setProperty('--custom-background', custom.background)
      root.style.setProperty('--custom-text', custom.text)
      root.style.setProperty('--custom-link', custom.link)
    }
  }
} catch {
  // Unreadable settings leave the system theme in place; the app's store then drops them.
}
