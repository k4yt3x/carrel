import { expect, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

const addBooks = async (page: Page, ...files: FixtureFile[]) => {
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles(files)
  await expect(page.getByRole('status')).toContainText('Added')
}

const openBook = async (page: Page, title: string) => {
  await page.goto('/')
  await page.getByRole('link', { name: title }).first().click()
  // The bars come with the book once it has opened: until then, a key or a click on the page
  // can come too early.
  await expect(page.getByRole('button', { name: 'Reading settings' })).toBeAttached()
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
  await expect(size).toHaveAttribute('aria-valuetext', '24 pixels')
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

test('the text size applies to books that set their own sizes in points', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.pointSized())
  await openBook(page, 'A Book Set in Points')
  // At the default size the book's 12pt (the browser's default 16px) is the reader's 18px.
  await expect.poll(() => pageStyle(page, 'font-size')).toBe('18px')
  await press(page, 'Reading settings')
  const size = page.getByRole('dialog', { name: 'Reading settings' }).getByRole('slider', {
    name: 'Size',
  })
  await size.focus()
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => pageStyle(page, 'font-size')).toBe('24px')
})

test('scrolls by default, and switches to pages and back', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const flow = () =>
    page.locator('foliate-view').evaluate((view) => {
      return (view as unknown as { renderer: Element }).renderer.getAttribute('flow')
    })
  await expect.poll(flow).toBe('scrolled')
  await press(page, 'Reading settings')
  const settings = page.getByRole('dialog', { name: 'Reading settings' })
  await settings.getByText('Pages', { exact: true }).click()
  await expect.poll(flow).toBe('paginated')
  await settings.getByText('Scroll', { exact: true }).click()
  await expect.poll(flow).toBe('scrolled')
})

test('brings the bars up when the mouse nears the top or bottom', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const header = page.locator('header')
  // The bars step aside a few seconds after the book opens.
  await expect(header).toHaveCSS('opacity', '0', { timeout: 8000 })
  const { height } = page.viewportSize() ?? { height: 720 }
  await page.mouse.move(400, height / 2)
  await page.mouse.move(400, 10)
  await expect(header).toHaveCSS('opacity', '1')
  await page.mouse.move(400, height / 2)
  await expect(header).toHaveCSS('opacity', '0')
  await page.mouse.move(400, height - 10)
  await expect(page.locator('footer')).toHaveCSS('opacity', '1')
  await page.mouse.move(400, height / 2)
  await expect(header).toHaveCSS('opacity', '0')

  // A quick move straight out of the window, past the top, with no event near the edge.
  await page.mouse.move(400, -20)
  await expect(header).toHaveCSS('opacity', '1')
})

test('brings the bars up for a pen near the edge, but not for a finger', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const header = page.locator('header')
  await expect(header).toHaveCSS('opacity', '0', { timeout: 8000 })
  // Some drivers report a mouse as a pen. The move lands in the book's page, near its top.
  const moveNearTop = (pointerType: string) =>
    page.locator('foliate-view').evaluate((view, type) => {
      const doc = (
        view as unknown as { renderer: { getContents(): { doc: Document }[] } }
      ).renderer.getContents()[0]?.doc
      const frame = doc?.defaultView?.frameElement?.getBoundingClientRect()
      doc?.dispatchEvent(
        new PointerEvent('pointermove', { pointerType: type, clientY: 4 - (frame?.top ?? 0) }),
      )
    }, pointerType)
  await moveNearTop('touch')
  await page.waitForTimeout(300)
  await expect(header).toHaveCSS('opacity', '0')
  await moveNearTop('pen')
  await expect(header).toHaveCSS('opacity', '1')
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
  await expect.poll(() => pageStyle(page, 'color')).toBe('rgb(209, 213, 215)')

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
  // The last chapter: the one before it is Chapter Two, and there is none after.
  await expect(page.getByRole('button', { name: 'Previous chapter' })).toHaveAttribute(
    'aria-description',
    'Chapter Two',
  )
  await expect(page.getByRole('button', { name: 'Next chapter' })).toBeDisabled()
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
  // Still in the first chapter.
  await expect(page.getByRole('button', { name: 'Previous chapter' })).toBeDisabled()
})

test('zooms the pages of a PDF from the keyboard and the controls', async ({ page }) => {
  // A window taller than a page is wide, so a whole page fits at the width and the zoom is
  // the whole of the scale.
  await page.setViewportSize({ width: 600, height: 900 })
  await page.goto('/')
  await addBooks(page, fixtures.pdf())
  await openBook(page, 'A Portable Document')
  const scale = () =>
    page.locator('foliate-view').evaluate((view) => {
      return (view as unknown as { renderer: Element }).renderer.getAttribute('scale-factor')
    })
  await page.keyboard.press('Control+=')
  await expect.poll(scale).toBe('110')
  await press(page, 'Zoom in')
  await expect.poll(scale).toBe('125')
  // The steps run from a tenth of the fitted size to five times it, and stop there.
  for (let step = 0; step < 20; step++) await page.keyboard.press('Control+-')
  await expect.poll(scale).toBe('10')
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
  for (let step = 0; step < 20; step++) await page.keyboard.press('Control+=')
  await expect.poll(scale).toBe('500')
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
  await press(page, 'Zoom 500%, reset to fit')
  await expect.poll(scale).toBe('100')
})

test('opens the fonts window from the reading settings and comes back', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await press(page, 'Reading settings')
  await page
    .getByRole('dialog', { name: 'Reading settings' })
    .getByRole('button', {
      name: 'Add font…',
    })
    .click()
  const fonts = page.getByRole('dialog', { name: 'Fonts' })
  await expect(fonts).toBeVisible()
  // It stays open: swapping one dialog for another must not count as dismissing it.
  await page.waitForTimeout(500)
  await expect(fonts).toBeVisible()
  await fonts.getByRole('button', { name: 'Close fonts' }).click()
  await expect(page.getByRole('dialog', { name: 'Reading settings' })).toBeVisible()
})

test('sets the book in a font installed on the device', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'lists fonts with the Local Font Access API')
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  // The list comes from the device; a stand-in keeps the test independent of what's installed.
  await page.evaluate(() => {
    Object.assign(window, {
      queryLocalFonts: async () => [
        { family: 'Liberation Serif' },
        { family: 'Liberation Serif' },
        { family: 'DejaVu Sans' },
      ],
    })
  })
  await press(page, 'Reading settings')
  const typeface = page.getByRole('dialog', { name: 'Reading settings' }).getByLabel('Typeface')
  await typeface.selectOption('action:list')
  await expect(typeface.locator('optgroup[label="On this device"] option')).toHaveText([
    'DejaVu Sans',
    'Liberation Serif',
  ])
  await typeface.selectOption({ label: 'DejaVu Sans' })
  await expect.poll(() => pageStyle(page, 'font-family')).toMatch(/^"DejaVu Sans"/)
})

test('lists the common fonts on the device where the browser can’t list them all', async ({
  page,
}) => {
  // As in Firefox and Safari, which have no Local Font Access API.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'queryLocalFonts', { value: undefined })
  })
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await press(page, 'Reading settings')
  const typeface = page.getByRole('dialog', { name: 'Reading settings' }).getByLabel('Typeface')
  // Liberation comes with Playwright's browsers and with most Linux systems.
  await expect(
    typeface.locator('optgroup[label="On this device"] option', { hasText: 'Liberation Serif' }),
  ).toHaveCount(1)
  await expect(typeface.locator('option', { hasText: 'Type a font name…' })).toHaveCount(1)
  await typeface.selectOption({ label: 'Liberation Serif' })
  await expect.poll(() => pageStyle(page, 'font-family')).toMatch(/^"Liberation Serif"/)
  // A listed font needs no name typed.
  await expect(page.getByRole('textbox', { name: 'Font name', exact: true })).toHaveCount(0)
})

test('a slider follows a drag, and the book follows when it is let go', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await press(page, 'Reading settings')
  const slider = page
    .getByRole('dialog', { name: 'Reading settings' })
    .getByRole('slider', { name: 'Line length' })
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  if (!box) throw new Error('the slider is not on screen')
  const lineLength = () =>
    page.locator('foliate-view').evaluate((view) => {
      return (view as unknown as { renderer: Element }).renderer.getAttribute('max-inline-size')
    })
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 20 })
  // The thumb is where the pointer is; laying the book out waits for the drag to settle.
  expect(Number(await slider.inputValue())).toBeGreaterThan(1000)
  // It keeps following the pointer off the slider, over the book's page and back.
  await page.mouse.move(box.x - 300, box.y + 200, { steps: 10 })
  await expect(slider).toHaveValue('400')
  await page.mouse.move(box.x + box.width * 0.6, box.y + 120, { steps: 10 })
  const dragged = await slider.inputValue()
  expect(Number(dragged)).toBeGreaterThan(800)
  await page.mouse.up()
  await expect.poll(lineLength).toBe(`${dragged}px`)
  await expect(page.getByRole('dialog', { name: 'Reading settings' })).toBeVisible()
})

test('takes an exact value typed beside a slider', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  await press(page, 'Reading settings')
  const settings = page.getByRole('dialog', { name: 'Reading settings' })
  const exact = settings.getByRole('textbox', { name: 'Line length, exact value in px' })
  await exact.fill('645')
  await exact.press('Enter')
  const lineLength = () =>
    page.locator('foliate-view').evaluate((view) => {
      return (view as unknown as { renderer: Element }).renderer.getAttribute('max-inline-size')
    })
  await expect.poll(lineLength).toBe('645px')
  // Out of range comes back within it; something that isn't a number changes nothing.
  await exact.fill('5000')
  await exact.press('Enter')
  await expect.poll(lineLength).toBe('1200px')
  await exact.fill('wide')
  await exact.press('Enter')
  await expect(exact).toHaveValue('1200')
})

test('scrolls from anywhere on the page; the progress bar runs the width of the window', async ({
  page,
}) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const scroller = () =>
    page.locator('foliate-view').evaluate((view) => {
      const renderer = (view as unknown as { renderer: Element }).renderer
      const container = renderer.shadowRoot?.getElementById('container')
      const rect = container?.getBoundingClientRect()
      return { top: container?.scrollTop ?? 0, left: rect?.left ?? -1, right: rect?.right ?? -1 }
    })
  const { width, height } = page.viewportSize() ?? { width: 1280, height: 720 }
  // The scroller spans the window, so its scrollbar is at the edge.
  expect(await scroller()).toMatchObject({ left: 0, right: width })
  const before = (await scroller()).top
  await page.mouse.move(20, height / 2)
  await page.mouse.wheel(0, 400)
  await expect.poll(async () => (await scroller()).top).toBeGreaterThan(before)

  // Between the chapter buttons, across the window.
  await page.mouse.move(width / 2, height - 10)
  const bar = await page.getByRole('slider', { name: 'Position in book' }).boundingBox()
  expect(bar?.width ?? 0).toBeGreaterThan(width * 0.75)
})

test('shows the progress in the corner of the page, as the reader chooses', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const corner = page.locator('p[aria-hidden]').filter({ hasText: /^\d+%$|^[\d,]+ \/ [\d,]+$/ })
  await expect(corner).toHaveText(/^\d+%$/)
  await press(page, 'Reading settings')
  const settings = page.getByRole('dialog', { name: 'Reading settings' })
  await settings.getByText('Page', { exact: true }).click()
  await expect(corner).toHaveText(/^1 \/ \d+$/)
  await settings.getByText('None', { exact: true }).click()
  await expect(corner).toHaveCount(0)
})

test('goes to the beginning and the end of the book from the bottom bar', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const beginning = page.getByRole('button', { name: 'Beginning of the book' })
  const end = page.getByRole('button', { name: 'End of the book' })
  await expect(beginning).toBeDisabled()
  await end.focus()
  await end.click()
  await expect(page.getByRole('button', { name: 'Next chapter' })).toBeDisabled()
  await expect(beginning).toBeEnabled()
  await beginning.click()
  await expect(page.getByRole('button', { name: 'Previous chapter' })).toBeDisabled()
})

test('steps through the chapters from the bottom bar', async ({ page }) => {
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const previous = page.getByRole('button', { name: 'Previous chapter' })
  const next = page.getByRole('button', { name: 'Next chapter' })
  // Each button names the chapter it goes to.
  await expect(previous).toBeDisabled()
  await expect(next).toHaveAttribute('aria-description', 'Chapter Two')
  await next.focus()
  await next.click()
  await expect(previous).toHaveAttribute('aria-description', 'Chapter One')
  await next.click()
  await expect(next).toBeDisabled()
  await previous.click()
  await expect(next).toHaveAttribute('aria-description', 'Chapter Three')
})

test('keeps the text centred on the window, and moves it by the reader’s offset', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 800 })
  await page.goto('/')
  await addBooks(page, fixtures.epub())
  await openBook(page, 'The Test Book')
  const text = () =>
    page.locator('foliate-view').evaluate((view) => {
      const doc = (
        view as unknown as { renderer: { getContents(): { doc: Document }[] } }
      ).renderer.getContents()[0]?.doc
      const frame = doc?.defaultView?.frameElement?.getBoundingClientRect()
      const body = doc?.body.getBoundingClientRect()
      return Math.round((frame?.left ?? 0) + (body?.left ?? 0) + (body?.width ?? 0) / 2)
    })
  await expect.poll(text).toBe(800)

  // Panels opening beside the text leave it where it is.
  await press(page, 'Contents')
  await expect(page.getByRole('complementary', { name: 'Contents' })).toBeVisible()
  await press(page, 'Reading settings')
  const settings = page.getByRole('dialog', { name: 'Reading settings' })
  await expect(settings).toBeVisible()
  expect(await text()).toBe(800)

  // The offset moves it, though not under the docked contents: its left edge stops 24 pixels
  // clear of them. Without them it goes the whole way, and stays for the next visit.
  const exact = settings.getByRole('textbox', { name: 'Position, exact value in px' })
  await exact.fill('-200')
  await exact.press('Enter')
  await expect.poll(text).toBe(320 + 24 + 320)
  await page.keyboard.press('Escape')
  await press(page, 'Close contents')
  await expect.poll(text).toBe(600)
  await page.reload()
  await expect.poll(text).toBe(600)
  // The scroller still spans the window, so its scrollbar stays at the edge.
  const scroller = await page.locator('foliate-view').evaluate((view) => {
    const renderer = (view as unknown as { renderer: Element }).renderer
    const rect = renderer.shadowRoot?.getElementById('container')?.getBoundingClientRect()
    return { left: rect?.left, right: rect?.right }
  })
  expect(scroller).toEqual({ left: 0, right: 1600 })

  // A docked contents sidebar that would cover the text moves it clear.
  await page.setViewportSize({ width: 1100, height: 800 })
  await press(page, 'Contents')
  const sidebar = await page.getByRole('complementary', { name: 'Contents' }).boundingBox()
  await expect
    .poll(async () => (await text()) - 320)
    .toBeGreaterThanOrEqual((sidebar?.x ?? 0) + (sidebar?.width ?? 0))
})
