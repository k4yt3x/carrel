import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

const addBooks = async (page: Page, ...files: FixtureFile[]) => {
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles(files)
  await expect(page.getByRole('status')).toContainText('Added')
}

/** The files a backup was written to in the app's private file system, where it has any. */
const backupFiles = (page: Page) =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const names: string[] = []
    try {
      for await (const name of (await root.getDirectoryHandle('backups')).keys()) names.push(name)
    } catch {
      // No backup has made the folder.
    }
    return names
  })

const openSettings = async (page: Page) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  return page.getByRole('dialog', { name: 'Settings' })
}

test.beforeEach(async ({ page }) => {
  // Without the File System Access picker, which a test can't answer, backups download.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await page.goto('/')
})

test('shows the library as a list, and remembers it', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  // The radio itself is hidden; its icon is what is clicked.
  await page.locator('label', { has: page.getByRole('radio', { name: 'List' }) }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'The Test Book' })
  await expect(row).toContainText('Ada Lovelace')
  // A row runs across the page, where a card is the width of a cover.
  expect((await row.boundingBox())?.width).toBeGreaterThan(400)
  await page.reload()
  await expect(page.getByRole('radio', { name: 'List' })).toBeChecked()
})

test('lines the list up under the header, in columns', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await addBooks(page, fixtures.epub())
  await page.locator('label', { has: page.getByRole('radio', { name: 'List' }) }).click()
  const header = await page.locator('header > div').boundingBox()
  const row = await page.getByRole('listitem').filter({ hasText: 'The Test Book' }).boundingBox()
  expect(Math.abs((row?.width ?? 0) - (header?.width ?? 0))).toBeLessThan(2)
  // The headings sort the list.
  await page.getByRole('button', { name: 'Title' }).click()
  await expect(page.getByRole('combobox', { name: 'Sort books' })).toHaveValue('title')
})

test('chooses several books and removes them together', async ({ page }) => {
  await addBooks(page, fixtures.epub(), fixtures.annotated(), fixtures.pdf())
  await page.getByRole('combobox', { name: 'Sort books' }).selectOption('title')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  // A Portable Document, An Annotated Book, The Test Book: Shift-click takes the run.
  const book = (title: string) => page.getByRole('checkbox', { name: new RegExp(title) })
  await book('A Portable Document').click()
  await book('The Test Book').click({ modifiers: ['Shift'] })
  await expect(page.getByText('3 selected')).toBeVisible()
  await book('A Portable Document').click()
  await expect(page.getByText('2 selected')).toBeVisible()

  await page.getByRole('button', { name: 'Remove…' }).click()
  const confirm = page.getByRole('dialog', { name: 'Remove 2 books?' })
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('listitem')).toContainText('A Portable Document')
  // Done, the library is back to opening books.
  await expect(page.getByRole('link', { name: /A Portable Document/ })).toBeVisible()
})

test('stops choosing on Escape, choosing nothing', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  // Select in a book's menu starts choosing, with that book chosen.
  await page.getByRole('button', { name: 'More actions for The Test Book' }).click()
  await page.locator(':popover-open').getByRole('button', { name: 'Select' }).click()
  await expect(page.getByRole('checkbox', { name: /The Test Book/ })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('link', { name: /The Test Book/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible()
})

test('shows what a book says about itself', async ({ page }) => {
  await addBooks(page, fixtures.described())
  await page.getByRole('button', { name: 'More actions for A Described Book' }).click()
  await page.locator(':popover-open').getByRole('button', { name: 'Details' }).click()
  const details = page.getByRole('dialog', { name: 'Book details' })
  await expect(details).toContainText('Mary Shelley')
  await expect(details).toContainText('A scientist makes a creature.')
  await expect(details.getByRole('definition').filter({ hasText: 'Lackington' })).toHaveCount(1)
  await expect(details).toContainText('Gothic fiction')
  await expect(details).toContainText('9780141439471')
  await expect(details).toContainText(/EPUB, \d/)
})

test('downloads a book’s file as it was added', async ({ page }) => {
  const book = fixtures.epub()
  await addBooks(page, book)
  await page.getByRole('button', { name: 'More actions for The Test Book' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe(book.name)
  expect(Buffer.compare(await readFile(await file.path()), book.buffer)).toBe(0)
})

test('a theme chosen in settings applies at once and on the next visit', async ({ page }) => {
  const settings = await openSettings(page)
  await settings.getByText('Dark', { exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(23, 23, 28)')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await (await openSettings(page)).getByText('Auto', { exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
})

test('backs up the library and restores it after the book is removed', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  // A place in the book, to see it come back.
  await page.getByRole('link', { name: 'The Test Book' }).first().click()
  // The bars come with the book once it has opened, as the reader loads.
  await expect(page.getByRole('button', { name: 'Reading settings' })).toBeAttached()
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.goBack()
  const card = page.getByRole('listitem').filter({ hasText: 'The Test Book' })
  await expect(card).toContainText('%')
  const place = (await card.textContent())?.match(/\d+%/)?.[0] ?? ''

  let settings = await openSettings(page)
  const download = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Back up library' }).click()
  const backup = await download
  expect(backup.suggestedFilename()).toMatch(/^carrel-backup-\d{4}-\d{2}-\d{2}\.zip$/)
  await expect(settings.getByRole('status')).toHaveText('Backup saved.')
  // Written to a file on disk rather than built in memory, and kept for the download.
  expect(await backupFiles(page)).toEqual([expect.stringMatching(/^\d+-carrel-backup-/)])
  await settings.getByRole('button', { name: 'Close settings' }).click()

  await page.getByRole('button', { name: 'More actions for The Test Book' }).click()
  await page.getByRole('button', { name: 'Remove from library…' }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Start your library' })).toBeVisible()

  // The empty library's Restore goes straight to choosing the backup.
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Restore a backup' }).click()
  await (await chooser).setFiles(await backup.path())
  settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings).toContainText(/Backup from .*: 1 book\./)
  await settings.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(settings.getByRole('status')).toContainText('Added 1 book.')
  await settings.getByRole('button', { name: 'Close settings' }).click()
  await expect(card).toContainText(place)
})

test('clears backup files once their downloads have had time to finish', async ({ page }) => {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const backups = await root.getDirectoryHandle('backups', { create: true })
    const hour = 60 * 60 * 1000
    for (const made of [Date.now() - 2 * hour, Date.now() - hour / 2]) {
      await backups.getFileHandle(`${made}-carrel-backup.zip`, { create: true })
    }
  })
  await page.reload()
  await expect.poll(() => backupFiles(page)).toHaveLength(1)
  const [kept] = await backupFiles(page)
  expect(Date.now() - Number.parseInt(kept ?? '', 10)).toBeLessThan(60 * 60 * 1000)
})

test('refuses a file that isn’t a backup', async ({ page }) => {
  const settings = await openSettings(page)
  await settings.locator('input[type="file"][accept*=".zip"]').setInputFiles({
    name: 'notes.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('not a zip at all'),
  })
  await expect(settings.getByRole('status')).toHaveText('This isn’t a Carrel backup.')
})

test('says why a file can’t be added as a font', async ({ page }) => {
  const settings = await openSettings(page)
  await settings.locator('input[type="file"][accept*=".woff2"]').setInputFiles(fixtures.text())
  await expect(settings.getByRole('status')).toContainText('isn’t a font file Carrel can use')
  await expect(settings.getByRole('region', { name: 'Your fonts' })).toContainText('No fonts yet')
})

test('adds a font from a link in a dialog of its own, which Escape closes alone', async ({
  page,
}) => {
  const settings = await openSettings(page)
  await settings.getByRole('button', { name: 'Add font' }).click()
  await page.getByRole('button', { name: 'From a link…' }).click()
  const link = page.getByRole('dialog', { name: 'Add a font from a link' })
  await expect(link.getByRole('textbox', { name: 'Link' })).toBeFocused()
  // The dialog opened from inside the settings closes; the settings stay.
  await page.keyboard.press('Escape')
  await expect(link).toBeHidden()
  await expect(settings).toBeVisible()
})

test('makes a theme of its own colours, and keeps it', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  const settings = await openSettings(page)
  await settings.getByRole('button', { name: 'New theme' }).click()
  const editor = page.getByRole('dialog', { name: 'New theme' })
  for (const [label, value] of [
    ['Page', '#1d2a24'],
    ['Text', '#d9e4dc'],
    ['Links', '#9ccfb0'],
  ] as const) {
    const field = editor.getByRole('textbox', { name: `${label}, hex value` })
    await field.fill(value)
    await field.press('Enter')
  }
  await editor.getByRole('textbox', { name: 'Name' }).fill('Forest')
  // Readable colours bring no warning.
  await expect(editor.getByRole('status')).toHaveCount(0)
  await editor.getByRole('button', { name: 'Save' }).click()

  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'custom')
  await expect(html).toHaveAttribute('data-scheme', 'dark')
  await expect(html).toHaveCSS('background-color', 'rgb(29, 42, 36)')
  await expect(settings.getByRole('radio', { name: 'Forest' })).toBeChecked()

  // It is in place before the app starts on the next visit, and book pages take its colours.
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'custom')
  await page.getByRole('link', { name: 'The Test Book' }).first().click()
  await expect(page.getByRole('button', { name: 'Reading settings' })).toBeAttached()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect
    .poll(() =>
      page.locator('foliate-view').evaluate((view) => {
        const doc = (
          view as unknown as { renderer: { getContents(): { doc: Document }[] } }
        ).renderer.getContents()[0]?.doc
        const paragraph = doc?.querySelector('p')
        return paragraph ? getComputedStyle(paragraph).color : null
      }),
    )
    .toBe('rgb(217, 228, 220)')

  // Deleting it brings back the system theme.
  await page.goto('/')
  const again = await openSettings(page)
  // The pencil shows when the pointer is over the theme.
  await again.getByText('Forest', { exact: true }).hover()
  const edit = again.getByRole('button', { name: 'Edit Forest' })
  await expect(edit).toHaveCSS('opacity', '1')
  await edit.click()
  await page
    .getByRole('dialog', { name: 'Edit theme' })
    .getByRole('button', { name: 'Delete theme' })
    .click()
  await expect(html).not.toHaveAttribute('data-theme', /.+/)
  await expect(again.getByRole('radio', { name: 'Forest' })).toHaveCount(0)
})

test('warns when a theme’s text is too faint to read', async ({ page }) => {
  const settings = await openSettings(page)
  await settings.getByRole('button', { name: 'New theme' }).click()
  const editor = page.getByRole('dialog', { name: 'New theme' })
  const set = async (label: string, value: string) => {
    const field = editor.getByRole('textbox', { name: `${label}, hex value` })
    await field.fill(value)
    await field.press('Enter')
  }
  await set('Page', '#ffffff')
  await set('Text', '#dddddd')
  await expect(editor.getByRole('status')).toHaveText(
    'Text this close to the page colour is hard to read.',
  )
  await set('Text', '#222222')
  await set('Links', '#222222')
  await expect(editor.getByRole('status')).toHaveCount(0)
})
