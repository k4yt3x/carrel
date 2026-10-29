/**
 * How books are shown. One set of reading settings applies to every book; a book can be given
 * its own copy, which then applies to that book alone.
 *
 * Stored settings come from localStorage, IndexedDB and backup files, all outside the app's
 * control, so every read goes through `normalizeReadingSettings`: it is the one place that
 * fills in fields added since the settings were saved and drops values it does not accept.
 */

import type { CustomThemeRef } from '@/domain/themes'

export const builtinThemes = ['system', 'light', 'dark'] as const
export type BuiltinTheme = (typeof builtinThemes)[number]
/** A theme that comes with Carrel, or one the reader made (see themes.ts). */
export type Theme = BuiltinTheme | CustomThemeRef

/**
 * The book's own fonts, the system's serif or sans-serif, a font the reader added (by its id),
 * or a font installed on the device (by its family name).
 */
export type Typeface = 'book' | 'serif' | 'sans' | { fontId: string } | { family: string }

/** Longest font family name kept; real ones are a few dozen characters. */
export const familyNameLimit = 200

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
  /**
   * The band above reflowable text: the chapter's title (the book's over the left page of a
   * spread, as in print), the book's title, the band left empty, or no band.
   */
  header: 'book' | 'chapter' | 'blank' | 'hide'
  /**
   * The band below reflowable text, and the corner of a fixed layout's page: the reader's
   * progress as a percentage or a page (of a fixed layout, or of the text in fixed lengths), the
   * band left empty, or no band.
   */
  footer: 'percent' | 'page' | 'blank' | 'hide'
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
  flow: 'scrolled',
  columns: 'auto',
  maxColumnWidth: 640,
  sideMargin: 16,
  pageTurn: 'slide',
  tapToTurn: true,
  header: 'chapter',
  footer: 'percent',
  pageFit: 'page',
  spreads: 'auto',
  customCss: '',
}

/**
 * The range of each numeric setting, which the normalizer enforces, and the step its slider
 * moves in. Typed values may fall between steps.
 */
export const limits = {
  fontSize: { min: 12, max: 36, step: 1 },
  lineHeight: { min: 1, max: 2.4, step: 0.05 },
  letterSpacing: { min: -0.05, max: 0.2, step: 0.01 },
  wordSpacing: { min: 0, max: 0.5, step: 0.01 },
  maxColumnWidth: { min: 400, max: 1200, step: 10 },
  sideMargin: { min: 0, max: 96, step: 2 },
} as const satisfies Partial<
  Record<keyof ReadingSettings, { min: number; max: number; step: number }>
>

/**
 * How far the text may be moved from the window's centre, in pixels either way. Past any screen
 * in use; the reader keeps the text inside the window whatever is stored.
 */
export const textOffsetLimit = 4000

/**
 * The reader's offset of the text from the window's centre: pixels to the right, negative to the
 * left. For browsers whose window isn't centred on the screen, such as one with vertical tabs.
 */
export function normalizeTextOffset(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  // `+ 0` turns a rounded -0 into 0.
  return Math.round(Math.max(-textOffsetLimit, Math.min(textOffsetLimit, raw))) + 0
}

/** The docked contents' width, in pixels: wide enough for a chapter title, never most of the page. */
export const tocWidthLimits = { min: 240, max: 560, default: 320 } as const

export function normalizeTocWidth(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return tocWidthLimits.default
  return Math.round(Math.max(tocWidthLimits.min, Math.min(tocWidthLimits.max, raw)))
}

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
  if (isRecord(value) && typeof value.family === 'string') {
    const family = value.family.trim()
    if (family && family.length <= familyNameLimit) return { family }
  }
  return defaultReadingSettings.typeface
}

/**
 * The footer of settings saved before it was a choice: from the progress, whose 'none' left no
 * band, or in settings older still, from the switch for the running heads, which hid the
 * progress with them.
 */
function earlierFooter(value: Record<string, unknown>): ReadingSettings['footer'] {
  if (value.progress === 'percent' || value.progress === 'page') return value.progress
  if (value.progress === 'none') return 'hide'
  return value.runningHeads === false ? 'hide' : defaultReadingSettings.footer
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
    // Settings saved before the header was a choice had a switch for the running heads.
    header: oneOf(
      ['book', 'chapter', 'blank', 'hide'],
      value.header,
      value.runningHeads === false ? 'hide' : d.header,
    ),
    footer: oneOf(['percent', 'page', 'blank', 'hide'], value.footer, earlierFooter(value)),
    pageFit: oneOf(['page', 'width'], value.pageFit, d.pageFit),
    spreads: oneOf(['auto', 'none'], value.spreads, d.spreads),
    customCss:
      typeof value.customCss === 'string' ? value.customCss.slice(0, customCssLimit) : d.customCss,
  }
}

export const isBuiltinTheme = (value: unknown): value is BuiltinTheme =>
  builtinThemes.includes(value as BuiltinTheme)
