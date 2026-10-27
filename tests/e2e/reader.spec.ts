import { expect, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

const addBooks = async (page: Page, ...files: FixtureFile[]) => {
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles(files)
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
  // The turns land one after another, each scrolling for a moment; the place left is where
  // they settle, the same a whole second apart.
  let left: string | null = start
  await expect
    .poll(
      async () => {
        const now = await position(page)
        const settled = now === left && now !== start
        left = now
        return settled
      },
      { intervals: [1000], timeout: 15_000 },
    )
    .toBe(true)
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
  // Docked beside the page on a wide window, and still there after a chapter is chosen.
  const contents = page.getByRole('complementary', { name: 'Contents' })
  await expect(contents.getByRole('button', { name: 'Chapter One' })).toHaveAttribute(
    'aria-current',
    'location',
  )
  await contents.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(contents.getByRole('button', { name: 'Chapter Three' })).toHaveAttribute(
    'aria-current',
    'location',
  )
  await expect(contents).toBeVisible()

  // The keyboard moves through the list, and Escape puts it away.
  await contents.getByRole('button', { name: 'Chapter One' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(contents.getByRole('button', { name: 'Chapter Two' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(contents).toBeHidden()
  await expect(page.getByRole('button', { name: 'Contents' })).toBeFocused()
})

test('folds the parts of the contents, and resizes them', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.described())
  await openBook(page, 'A Described Book')
  await page.getByRole('button', { name: 'Contents' }).focus()
  await page.getByRole('button', { name: 'Contents' }).click()
  const contents = page.getByRole('complementary', { name: 'Contents' })
  // Reading the first chapter, the part after it starts folded.
  const part = contents.getByRole('button', { name: 'Part Two', exact: true })
  await expect(part).toHaveAttribute('aria-expanded', 'false')
  await expect(contents.getByRole('button', { name: 'Chapter Two' })).toHaveCount(0)
  await contents.getByRole('button', { name: 'Unfold Part Two' }).click()
  await expect(contents.getByRole('button', { name: 'Chapter Two' })).toBeVisible()
  // From the keyboard: left folds it again, right unfolds it.
  await part.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(part).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(part).toHaveAttribute('aria-expanded', 'true')

  // The edge resizes the contents, and the width stays for the next visit.
  const before = (await contents.boundingBox())?.width ?? 0
  const edge = contents.getByRole('separator', { name: 'Resize contents' })
  await edge.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await contents.boundingBox())?.width).toBe(before + 32)
  await page.reload()
  await page.getByRole('button', { name: 'Contents' }).focus()
  await page.getByRole('button', { name: 'Contents' }).click()
  await expect
    .poll(
      async () =>
        (await page.getByRole('complementary', { name: 'Contents' }).boundingBox())?.width,
    )
    .toBe(before + 32)
})

test('shows the open book’s details from the reader', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.described())
  await openBook(page, 'A Described Book')
  await page.getByRole('button', { name: 'Book details' }).focus()
  await page.getByRole('button', { name: 'Book details' }).click()
  const details = page.getByRole('dialog', { name: 'Book details' })
  await expect(details).toContainText('Lackington, Hughes')
  await expect(details).toContainText('Science fiction')
})

test('on a narrow window, the contents close once a chapter is chosen', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 })
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await page.getByRole('button', { name: 'Contents' }).focus()
  await page.getByRole('button', { name: 'Contents' }).click()
  const contents = page.getByRole('dialog', { name: 'Contents' })
  await contents.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(contents).toBeHidden()
  await expect(page.getByRole('button', { name: 'Next chapter' })).toBeDisabled()
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

test('lets a book load nothing from a server', async ({ page }) => {
  // Anything the page asks of the remote host comes here; the policy should let nothing out.
  const asked: string[] = []
  await page.route('https://remote.test/**', (route) => {
    asked.push(route.request().url())
    return route.fulfill({ status: 404 })
  })
  await page.goto('/')
  await addBooks(page, fixtures.remote())
  await openBook(page, 'A Book That Reaches Out')
  const frame = page.frameLocator('foliate-view iframe').first()
  await expect(frame.getByRole('heading', { name: 'Chapter One' })).toBeVisible()
  // The heading's font is the last thing the page asks for, once its text is laid out.
  await expect
    .poll(() => frame.locator('h1').evaluate((h1) => h1.ownerDocument.fonts.status))
    .toBe('loaded')
  expect(asked).toEqual([])
})

test('tells the reader when the book is no longer there', async ({ page }) => {
  await page.goto(`/#/read/${'0'.repeat(64)}`)
  await expect(page.getByRole('alert')).toContainText('This book isn’t in your library')
  await page.getByRole('link', { name: 'Back to library' }).click()
  await expect(page.getByRole('heading', { name: 'Start your library' })).toBeVisible()
})
