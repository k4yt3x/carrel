import { expect, type Locator, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

// Chromium dressed as an iPhone: Safari's user agent, its screen, a touch screen.
test.use({
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
})

const addBooks = async (page: Page, ...files: FixtureFile[]) => {
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles(files)
  await expect(page.getByRole('status')).toContainText('Added')
}

const openBook = async (page: Page, title: string) => {
  await page.getByRole('link', { name: title }).first().click()
  await expect(page.getByRole('button', { name: 'Reading settings' })).toBeAttached()
}

/** The edges an iPhone's notch, Dynamic Island and home indicator take, as Safari reports. */
const setSafeArea = async (
  page: Page,
  insets: { top: number; right: number; bottom: number; left: number },
) => {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets })
}

const box = async (locator: Locator) => {
  const found = await locator.boundingBox()
  if (!found) throw new Error('not on screen')
  return { ...found, right: found.x + found.width, bottom: found.y + found.height }
}

test('lets any file be picked, since iOS greys out the types it doesn’t know', async ({ page }) => {
  await page.goto('/')
  const books = page.locator('input[type="file"][accept*=".epub"]')
  await expect(books).toHaveAttribute('accept', /\.mobi.*application\/octet-stream/)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const fonts = page.locator('input[type="file"][accept*=".woff2"]')
  await expect(fonts).toHaveAttribute('accept', /application\/octet-stream/)
})

test('saves files through the share sheet in the Home Screen app, again on a later tap', async ({
  page,
}) => {
  // The Home Screen app: no File System Access, a share sheet that takes files, and the first
  // share refused as if its tap were too long ago.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
    Object.defineProperty(navigator, 'standalone', { value: true })
    const shared: { name: string; size: number }[] = []
    let refusals = 1
    Object.assign(window, { shared })
    Object.defineProperty(navigator, 'canShare', { value: () => true })
    Object.defineProperty(navigator, 'share', {
      value: async ({ files }: { files: File[] }) => {
        if (refusals-- > 0) throw new DOMException('The tap was too long ago.', 'NotAllowedError')
        shared.push(...files.map((file) => ({ name: file.name, size: file.size })))
      },
    })
  })
  page.on('download', () => {
    throw new Error('a download opens a preview the Home Screen app can’t leave')
  })
  const shared = () => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared)
  await page.goto('/')
  const book = fixtures.epub()
  await addBooks(page, book)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('button', { name: 'Back up library' }).click()
  await expect(settings).toContainText('Your backup is ready.')
  await settings.getByRole('button', { name: 'Save backup…' }).click()
  await expect(settings.getByRole('status')).toHaveText('Backup saved.')
  expect(await shared()).toEqual([
    {
      name: expect.stringMatching(/^carrel-backup-\d{4}-\d{2}-\d{2}\.zip$/),
      size: expect.any(Number),
    },
  ])
  await settings.getByRole('button', { name: 'Close settings' }).click()

  await page.getByRole('button', { name: 'More actions for The Test Book' }).click()
  await page.getByRole('button', { name: 'Download file' }).click()
  await expect.poll(shared).toHaveLength(2)
  expect((await shared())[1]).toEqual({ name: book.name, size: book.buffer.length })
})

test('keeps clear of the notch, the Dynamic Island and the home indicator', async ({ page }) => {
  await page.goto('/')
  await setSafeArea(page, { top: 59, right: 0, bottom: 34, left: 0 })
  await addBooks(page, fixtures.epub())
  expect((await box(page.getByRole('heading', { name: 'Carrel' }))).y).toBeGreaterThan(59)
  const notice = await box(page.getByRole('status').filter({ hasText: 'Added' }))
  expect(notice.bottom).toBeLessThanOrEqual(852 - 34)

  await openBook(page, 'The Test Book')
  const view = page.locator('foliate-view')
  expect((await box(view)).y).toBeGreaterThanOrEqual(59)
  expect((await box(view)).bottom).toBeLessThanOrEqual(852 - 34)
  const back = page.getByRole('link', { name: 'Back to library' })
  expect((await box(back)).y).toBeGreaterThanOrEqual(59)

  // On its side, the island is at one end and the indicator below.
  await page.setViewportSize({ width: 852, height: 393 })
  await setSafeArea(page, { top: 0, right: 59, bottom: 21, left: 59 })
  await page.getByRole('button', { name: 'Reading settings' }).focus()
  expect((await box(back)).x).toBeGreaterThanOrEqual(59)
  const settingsButton = page.getByRole('button', { name: 'Reading settings' })
  expect((await box(settingsButton)).right).toBeLessThanOrEqual(852 - 59)
  expect((await box(view)).x).toBeGreaterThanOrEqual(59)
  expect((await box(view)).right).toBeLessThanOrEqual(852 - 59)
  // The text stays centred on the window, the edges being the same on either side, and the
  // progress in the page's corner lines up with it.
  const text = () =>
    page.evaluate(() => {
      type View = { renderer: { getContents(): { doc: Document }[] } }
      const view = document.querySelector('foliate-view') as unknown as View | null
      const doc = view?.renderer.getContents()[0]?.doc
      const frame = doc?.defaultView?.frameElement?.getBoundingClientRect()
      const body = doc?.body.getBoundingClientRect()
      return frame && body ? { left: frame.left + body.left, width: body.width } : null
    })
  await expect
    .poll(async () => {
      const extent = await text()
      return extent && extent.left + extent.width / 2
    })
    .toBeCloseTo(426, -1)
  const progress = page.locator('p[aria-hidden="true"]', { hasText: /^\d+%$/ })
  await expect
    .poll(async () => (await box(progress)).x - ((await text())?.left ?? 0))
    .toBeCloseTo(0, 0)

  await page.goBack()
  expect((await box(page.getByRole('heading', { name: 'Carrel' }))).x).toBeGreaterThan(59)
  const settings = page.getByRole('button', { name: 'Settings', exact: true })
  expect((await box(settings)).right).toBeLessThanOrEqual(852 - 59)
})

test('sets form fields in 16px on a touch screen, so iOS doesn’t zoom into them', async ({
  page,
}) => {
  const fieldSizes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('input, select, textarea')]
        .filter((field) => {
          const type = field.getAttribute('type')
          return (
            field.getClientRects().length > 0 &&
            !['checkbox', 'radio', 'range'].includes(type ?? '')
          )
        })
        .map((field) => [
          field.getAttribute('aria-label') ?? field.tagName,
          getComputedStyle(field).fontSize,
        ]),
    )
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  const library = await fieldSizes()
  expect(library.length).toBeGreaterThan(0)
  for (const [, size] of library) expect(size).toBe('16px')

  await openBook(page, 'The Test Book')
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Reading settings' })).toBeVisible()
  const reading = await fieldSizes()
  expect(reading.length).toBeGreaterThan(3)
  for (const [, size] of reading) expect(size).toBe('16px')
})
