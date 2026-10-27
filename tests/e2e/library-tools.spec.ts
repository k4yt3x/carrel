import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

const addBooks = async (page: Page, ...files: FixtureFile[]) => {
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles(files)
  await expect(page.getByRole('status')).toContainText('Added')
}

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
  await page.getByRole('radio', { name: 'List' }).check({ force: true })
  const row = page.getByRole('listitem').filter({ hasText: 'The Test Book' })
  await expect(row).toContainText('Ada Lovelace')
  // A row runs across the page, where a card is the width of a cover.
  expect((await row.boundingBox())?.width).toBeGreaterThan(400)
  await page.reload()
  await expect(page.getByRole('radio', { name: 'List' })).toBeChecked()
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
  await settings.getByText('Sepia', { exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(240, 234, 219)')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia')
  await (await openSettings(page)).getByText('System', { exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
})

test('backs up the library and restores it after the book is removed', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  // A place in the book, to see it come back.
  await page.getByRole('link', { name: 'The Test Book' }).first().click()
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
  await settings.getByRole('button', { name: 'Close settings' }).click()

  await page.getByRole('button', { name: 'More actions for The Test Book' }).click()
  await page.getByRole('button', { name: 'Remove from library…' }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Start your library' })).toBeVisible()

  await page.getByRole('button', { name: 'Restore a backup' }).click()
  settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.locator('input[type="file"][accept*=".zip"]').setInputFiles(await backup.path())
  await expect(settings).toContainText('It holds 1 book.')
  await settings.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(settings.getByRole('status')).toContainText('Added 1 book.')
  await settings.getByRole('button', { name: 'Close settings' }).click()
  await expect(card).toContainText(place)
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
