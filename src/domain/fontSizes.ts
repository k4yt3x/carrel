/**
 * The reader's Size setting sets the font size of each page's root element, and type set in
 * relative units (em, rem, %) follows it. Books often set text in absolute units instead, such
 * as `12pt` or `16px`, or in size keywords such as `medium`, which are relative to the
 * browser's default size rather than the root's; that text would ignore the setting.
 *
 * These are rewritten as rem against the browser's default of 16px, so at the default size
 * the book looks exactly as it was styled, and at any other size it scales with the setting.
 * Only `font-size` and the `font` shorthand are touched; other lengths are layout, which the
 * setting should not change.
 */

const pxPerUnit: Record<string, number> = {
  px: 1,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
}

/** The size keywords at the browser's default size, as browsers compute them. */
const keywordPx: Record<string, number> = {
  'xx-small': 9,
  'x-small': 10,
  small: 13,
  medium: 16,
  large: 18,
  'x-large': 24,
  'xx-large': 32,
  'xxx-large': 48,
}

const defaultPx = 16

const rem = (px: number) => `${Number((px / defaultPx).toFixed(4))}rem`

const absoluteLength = /(?<![\w.-])(\d*\.?\d+)(px|pt|pc|in|cm|mm|q)(?![\w-])/gi
const sizeKeyword =
  /(?<![\w-])(xxx-large|xx-large|x-large|large|medium|small|x-small|xx-small)(?![\w-])/gi

/** One declaration's value with its absolute sizes as rem; quoted text (font names) is kept. */
function relativeValue(value: string): string {
  // Splitting on quoted strings keeps them at odd indices, untouched.
  return value
    .split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(absoluteLength, (_, number: string, unit: string) =>
              rem(Number.parseFloat(number) * (pxPerUnit[unit.toLowerCase()] ?? 1)),
            )
            .replace(sizeKeyword, (keyword: string) =>
              rem(keywordPx[keyword.toLowerCase()] ?? defaultPx),
            ),
    )
    .join('')
}

const sizeDeclaration = /(^|[{;\s])(font-size|font)(\s*:\s*)([^;{}]*)/gi

/** CSS (a stylesheet or a style attribute) with absolute font sizes rewritten as rem. */
export function relativeFontSizes(css: string): string {
  return css.replace(
    sizeDeclaration,
    (_, before: string, property: string, colon: string, value: string) =>
      `${before}${property}${colon}${relativeValue(value)}`,
  )
}

/**
 * Rewrites the font sizes in a page's own <style> elements and style attributes. SVG keeps
 * its sizes: they are in the drawing's units, scaled with the drawing.
 */
export function relativeFontSizesInDocument(doc: Document): void {
  for (const element of doc.querySelectorAll('style')) {
    if (element.closest('svg')) continue
    element.textContent = relativeFontSizes(element.textContent ?? '')
  }
  for (const element of doc.querySelectorAll('[style]')) {
    if (element.closest('svg')) continue
    const style = element.getAttribute('style') ?? ''
    const rewritten = relativeFontSizes(style)
    if (rewritten !== style) element.setAttribute('style', rewritten)
  }
}
