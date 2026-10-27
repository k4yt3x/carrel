import { expect, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

const addBooks = async (page: Page, ...files: FixtureFile[]) => {
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles(files)
  await expect(page.getByRole('status')).toContainText('Added')
}

const openBook = async (page: Page, title: string) => {
  await page.goto('/')
  await page.getByRole('link', { name: title }).first().click()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect.poll(() => page.locator('foliate-view').evaluate(hasPage)).toBe(true)
}

const hasPage = (view: Element) =>
  ((view as Element & { renderer?: { getContents?(): unknown[] } }).renderer?.getContents?.() ?? [])
    .length > 0

/** Focus brings the reader's bars up if they have already stepped aside. */
const press = async (page: Page, name: string) => {
  const button = page.getByRole('button', { name, exact: true })
  await button.focus()
  await button.click()
}

/** A computed style of the first paragraph on screen in the book. */
const pageStyle = (page: Page, property: string) =>
  page.locator('foliate-view').evaluate((view, name) => {
    const renderer = (view as unknown as { renderer: { getContents(): { doc: Document }[] } })
      .renderer
    const doc = renderer.getContents()[0]?.doc
    const paragraph = doc?.querySelector('p')
    return paragraph ? getComputedStyle(paragraph).getPropertyValue(name) : null
  }, property)

test('reading settings change the page, and a book can keep its own', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub(), fixtures.annotated())
  await openBook(page, 'The Test Book')
  const before = await pageStyle(page, 'font-size')

  await press(page, 'Reading settings')
  const settings = page.getByRole('dialog', { name: 'Reading settings' })
  const size = settings.getByRole('slider', { name: 'Size' })
  await size.focus()
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect(size).toHaveAttribute('aria-valuetext', '24px')
  await expect.poll(() => pageStyle(page, 'font-size')).toBe('24px')
  expect(before).not.toBe('24px')

  // This book alone goes larger still; other books keep the shared size.
  await settings.getByText('This book', { exact: true }).click()
  for (let i = 0; i < 4; i++) await size.press('ArrowRight')
  await expect.poll(() => pageStyle(page, 'font-size')).toBe('28px')
  await page.keyboard.press('Escape')

  await openBook(page, 'An Annotated Book')
  await expect.poll(() => pageStyle(page, 'font-size')).toBe('24px')

  await openBook(page, 'The Test Book')
  await expect.poll(() => pageStyle(page, 'font-size')).toBe('28px')
  await page.reload()
  await expect.poll(() => pageStyle(page, 'font-size')).toBe('28px')
})

test('switches to scrolling and back', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const flow = () =>
    page.locator('foliate-view').evaluate((view) => {
      return (view as unknown as { renderer: Element }).renderer.getAttribute('flow')
    })
  await expect.poll(flow).toBe('paginated')
  await press(page, 'Reading settings')
  const settings = page.getByRole('dialog', { name: 'Reading settings' })
  await settings.getByText('Scroll', { exact: true }).click()
  await expect.poll(flow).toBe('scrolled')
  await settings.getByText('Pages', { exact: true }).click()
  await expect.poll(flow).toBe('paginated')
})

test('a theme chosen in the reader applies to the app and the page', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await press(page, 'Reading settings')
  await page
    .getByRole('dialog', { name: 'Reading settings' })
    .getByText('Dark', { exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // Dark pages recolour the book's text to the theme's light text.
  await expect.poll(() => pageStyle(page, 'color')).toBe('rgb(216, 215, 207)')

  // The theme is in place before the app starts on the next visit.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('searches the book and goes to a match', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await page.keyboard.press('Control+f')
  const search = page.getByRole('dialog', { name: 'Search' })
  await expect(search.getByRole('searchbox')).toBeFocused()
  await page.keyboard.type('paragraph 37')
  // Every chapter has a paragraph 37.
  await expect(search.getByRole('status')).toHaveText('3 matches')
  await search.getByRole('button', { name: /Chapter 3, paragraph 37/ }).click()
  await expect(search).toBeHidden()
  await expect(page.locator('header')).toContainText('Chapter Three')
})

test('shows a footnote in a popup without leaving the page', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.annotated())
  await openBook(page, 'An Annotated Book')
  await page.frameLocator('foliate-view iframe').first().getByRole('link', { name: '1' }).click()
  const note = page.getByRole('dialog', { name: 'Note' })
  await expect(
    note.frameLocator('foliate-view iframe').first().getByText('The note says that monks'),
  ).toBeVisible()
  await note.getByRole('button', { name: 'Close note' }).click()
  await expect(note).toBeHidden()
  await expect(page.locator('header')).toContainText('Chapter One')
})

test('zooms the pages of a PDF from the keyboard and the controls', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.pdf())
  await openBook(page, 'A Portable Document')
  const scale = () =>
    page.locator('foliate-view').evaluate((view) => {
      return (view as unknown as { renderer: Element }).renderer.getAttribute('scale-factor')
    })
  await page.keyboard.press('Control+=')
  await expect.poll(scale).toBe('125')
  await press(page, 'Zoom in')
  await expect.poll(scale).toBe('150')
  await press(page, 'Zoom 150%, reset to fit')
  await expect.poll(scale).toBe('100')
})
