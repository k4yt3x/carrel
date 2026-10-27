import { expect, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

const addBooks = async (page: Page, ...files: FixtureFile[]) => {
  await page.locator('input[type="file"]').setInputFiles(files)
  await expect(page.getByRole('status')).toContainText('Added')
}

const openBook = async (page: Page, title: string) => {
  await page.getByRole('link', { name: title }).first().click()
  await expect(page.getByRole('status')).toHaveCount(0)
}

/** The reader's position label, which the scrubber exposes to assistive technology. */
const position = (page: Page) =>
  page.locator('input[aria-label="Position in book"]').getAttribute('aria-valuetext')

test('opens an EPUB at its beginning and turns pages', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await expect(
    page.frameLocator('foliate-view iframe').first().getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('The Test Book · Carrel')
  await expect.poll(() => position(page)).toMatch(/^\d+%$/)
  const start = await position(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => position(page)).not.toBe(start)
  expect(await position(page)).toMatch(/^\d+%$/)
})

test('reopens a book where the reader left it', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await expect.poll(() => position(page)).toMatch(/^\d+%$/)
  const start = await position(page)
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => position(page)).not.toBe(start)
  const left = await position(page)
  expect(left).toMatch(/^\d+%$/)

  await page.goBack()
  const card = page.getByRole('listitem').filter({ hasText: 'The Test Book' })
  await expect(card).toContainText(left ?? '')

  await openBook(page, 'The Test Book')
  await expect.poll(() => position(page)).toBe(left)

  await page.reload()
  await expect.poll(() => position(page)).toBe(left)
})

test('jumps to a chapter from the contents', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  // Focus brings the reader's bars up if they have already stepped aside.
  await page.getByRole('button', { name: 'Contents' }).focus()
  await page.getByRole('button', { name: 'Contents' }).click()
  const contents = page.getByRole('dialog', { name: 'Contents' })
  await expect(contents.getByRole('button', { name: 'Chapter One' })).toHaveAttribute(
    'aria-current',
    'location',
  )
  await contents.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(contents).toBeHidden()
  await expect(page.locator('header')).toContainText('Chapter Three')
})

test('shows a PDF page by page', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.pdf())
  await openBook(page, 'A Portable Document')
  await expect
    .poll(async () => {
      for (const frame of page.frames()) if (await frame.locator('canvas').count()) return true
      return false
    })
    .toBe(true)
  await expect.poll(() => position(page)).toMatch(/^\d of 3$/)
  const first = await position(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => position(page)).not.toBe(first)
})

test('never runs a book’s scripts', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.scripted())
  await openBook(page, 'A Book With Scripts')
  const frame = page.frameLocator('foliate-view iframe').first()
  await expect(frame.getByRole('heading', { name: 'Chapter One' })).toBeVisible()
  await frame.locator('#js-link').click()
  // Give any script that slipped through the chance to run.
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => 'bookScriptRan' in window || '__bookScriptRan' in window)).toBe(
    false,
  )
})

test('tells the reader when the book is no longer there', async ({ page }) => {
  await page.goto(`/#/read/${'0'.repeat(64)}`)
  await expect(page.getByRole('alert')).toContainText('This book isn’t in your library')
  await page.getByRole('link', { name: 'Back to library' }).click()
  await expect(page.getByRole('heading', { name: 'Start your library' })).toBeVisible()
})
