/**
 * How books are shown. One set of reading settings applies to every book; a book can be given
 * its own copy, which then applies to that book alone.
 *
 * Stored settings come from localStorage, IndexedDB and backup files, all outside the app's
 * control, so every read goes through `normalizeReadingSettings`: it is the one place that
 * fills in fields added since the settings were saved and drops values it does not accept.
 */

export const themes = ['system', 'light', 'sepia', 'dark'] as const
export type Theme = (typeof themes)[number]

/** The book's own fonts, the system's serif or sans-serif, or a font the reader added. */
export type Typeface = 'book' | 'serif' | 'sans' | { fontId: string }

export interface ReadingSettings {
  typeface: Typeface
  /** Base text size in CSS pixels. */
  fontSize: number
  lineHeight: number
  /** 'book' leaves alignment to the book. */
  textAlign: 'book' | 'start' | 'justify'
  hyphenate: boolean
  /** 'book' leaves paragraph spacing and indentation to the book. */
  paragraphs: 'book' | 'indented' | 'spaced'
  /** Extra space between letters, in em; 0 is the font's own spacing. */
  letterSpacing: number
  /** Extra space between words, in em; 0 is the font's own spacing. */
  wordSpacing: number
  /** In light themes, keep the colours a book sets for itself. Dark themes always recolour. */
  keepBookColors: boolean
  flow: 'paginated' | 'scrolled'
  /** 'auto' shows two pages side by side when the window is wide enough. */
  columns: 'auto' | 'one'
  /** Widest a column of text may grow, in CSS pixels. */
  maxColumnWidth: number
  /** Space between the text and the sides of the window, in CSS pixels. */
  sideMargin: number
  pageTurn: 'slide' | 'curl' | 'none'
  tapToTurn: boolean
  /** Book title, chapter and progress in the page margins. */
  runningHeads: boolean
  /** How fixed-layout books (PDF, comics) fit the window. */
  pageFit: 'page' | 'width'
  /** Whether fixed-layout books show facing pages side by side. */
  spreads: 'auto' | 'none'
  /** Applied to every page after everything else. */
  customCss: string
}

export const defaultReadingSettings: ReadingSettings = {
  typeface: 'book',
  fontSize: 18,
  lineHeight: 1.6,
  textAlign: 'book',
  hyphenate: true,
  paragraphs: 'book',
  letterSpacing: 0,
  wordSpacing: 0,
  keepBookColors: true,
  flow: 'paginated',
  columns: 'auto',
  maxColumnWidth: 640,
  sideMargin: 16,
  pageTurn: 'slide',
  tapToTurn: true,
  runningHeads: true,
  pageFit: 'page',
  spreads: 'auto',
  customCss: '',
}

/** The range and step of each numeric setting; the controls and the normalizer share them. */
export const limits = {
  fontSize: { min: 12, max: 36, step: 1 },
  lineHeight: { min: 1, max: 2.4, step: 0.1 },
  letterSpacing: { min: -0.05, max: 0.2, step: 0.01 },
  wordSpacing: { min: 0, max: 0.5, step: 0.05 },
  maxColumnWidth: { min: 400, max: 1200, step: 40 },
  sideMargin: { min: 0, max: 96, step: 8 },
} as const satisfies Partial<
  Record<keyof ReadingSettings, { min: number; max: number; step: number }>
>

/** Longest custom stylesheet kept; anything longer is a paste accident, not a stylesheet. */
export const customCssLimit = 100_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

function number(key: keyof typeof limits, value: unknown): number {
  const { min, max } = limits[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultReadingSettings[key]
  return Math.min(max, Math.max(min, value))
}

function typeface(value: unknown): Typeface {
  if (value === 'book' || value === 'serif' || value === 'sans') return value
  if (isRecord(value) && typeof value.fontId === 'string' && value.fontId) {
    return { fontId: value.fontId }
  }
  return defaultReadingSettings.typeface
}

export function normalizeReadingSettings(raw: unknown): ReadingSettings {
  const value = isRecord(raw) ? raw : {}
  const d = defaultReadingSettings
  const bool = (key: keyof ReadingSettings, fallback: boolean) =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : fallback
  return {
    typeface: typeface(value.typeface),
    fontSize: number('fontSize', value.fontSize),
    lineHeight: number('lineHeight', value.lineHeight),
    textAlign: oneOf(['book', 'start', 'justify'], value.textAlign, d.textAlign),
    hyphenate: bool('hyphenate', d.hyphenate),
    paragraphs: oneOf(['book', 'indented', 'spaced'], value.paragraphs, d.paragraphs),
    letterSpacing: number('letterSpacing', value.letterSpacing),
    wordSpacing: number('wordSpacing', value.wordSpacing),
    keepBookColors: bool('keepBookColors', d.keepBookColors),
    flow: oneOf(['paginated', 'scrolled'], value.flow, d.flow),
    columns: oneOf(['auto', 'one'], value.columns, d.columns),
    maxColumnWidth: number('maxColumnWidth', value.maxColumnWidth),
    sideMargin: number('sideMargin', value.sideMargin),
    pageTurn: oneOf(['slide', 'curl', 'none'], value.pageTurn, d.pageTurn),
    tapToTurn: bool('tapToTurn', d.tapToTurn),
    runningHeads: bool('runningHeads', d.runningHeads),
    pageFit: oneOf(['page', 'width'], value.pageFit, d.pageFit),
    spreads: oneOf(['auto', 'none'], value.spreads, d.spreads),
    customCss:
      typeof value.customCss === 'string' ? value.customCss.slice(0, customCssLimit) : d.customCss,
  }
}

export const isTheme = (value: unknown): value is Theme => themes.includes(value as Theme)
