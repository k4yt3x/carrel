// Applies the reader's chosen theme before the first paint, so a page pinned to dark or sepia
// does not flash the system's theme while the app loads. It runs as a classic script in
// <head>; the app keeps the attribute up to date afterwards (src/ui/useTheme.ts). The key and
// shape are those of the persisted app settings store (src/store/appSettings.ts).
try {
  const stored = JSON.parse(localStorage.getItem('carrel.app-settings') ?? 'null')
  const theme = stored?.state?.theme
  if (theme === 'light' || theme === 'sepia' || theme === 'dark') {
    document.documentElement.dataset.theme = theme
  }
} catch {
  // Unreadable settings leave the system theme in place; the app's store then drops them.
}
