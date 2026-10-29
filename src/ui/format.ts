const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const

/** A size in bytes as people read it: "820 kB", "12.4 MB", "1.2 GB" (powers of 1000). */
export function formatBytes(bytes: number, locale?: string): string {
  let value = bytes
  let index = 0
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000
    index++
  }
  const unit = units[index] ?? 'byte'
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    // The short form of a byte is "byte" whatever the count ("0 byte"); the long one counts.
    unitDisplay: unit === 'byte' ? 'long' : 'short',
    maximumFractionDigits: unit === 'byte' || unit === 'kilobyte' ? 0 : 1,
  }).format(value)
}

/**
 * The name of a language from its tag, or null for "undetermined". Only the language, script
 * and region are named: a book's tag can carry extensions and private-use parts that are valid
 * but that DisplayNames refuses. A tag it can't name at all is shown as it is.
 */
export function formatLanguage(tag: string, locale?: string): string | null {
  try {
    const { baseName } = new Intl.Locale(tag)
    if (baseName === 'und') return null
    return new Intl.DisplayNames(locale, { type: 'language' }).of(baseName) ?? tag
  } catch {
    return tag
  }
}

const dayMs = 24 * 60 * 60 * 1000

// Making a formatter costs far more than using one, and a list of books shows two days a book.
const formatters = new Map<string, Intl.RelativeTimeFormat | Intl.DateTimeFormat>()
function formatter<T extends Intl.RelativeTimeFormat | Intl.DateTimeFormat>(
  key: string,
  make: () => T,
): T {
  let made = formatters.get(key)
  if (!made) {
    made = make()
    formatters.set(key, made)
  }
  return made as T
}

/**
 * A day as people say it: "Today", "Yesterday", "3 days ago" within the week, then the date,
 * with the year only when it isn't this one. Days are counted by the calendar, not by 24-hour
 * spans, so last night is yesterday.
 */
export function formatDay(time: number, now = Date.now(), locale?: string): string {
  const midnight = (ms: number) => {
    const date = new Date(ms)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  }
  const days = Math.round((midnight(now) - midnight(time)) / dayMs)
  if (days >= 0 && days < 7) {
    const relative = formatter(
      `relative ${locale}`,
      () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    ).format(-days, 'day')
    return relative.charAt(0).toLocaleUpperCase(locale) + relative.slice(1)
  }
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear()
  return formatter(
    `date ${locale} ${sameYear}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
      }),
  ).format(time)
}
