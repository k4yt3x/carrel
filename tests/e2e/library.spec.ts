import { expect, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

const addBooks = (page: Page, ...files: FixtureFile[]) =>
  page.locator('input[type="file"][accept*=".epub"]').setInputFiles(files)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('an empty library explains itself and offers to add books', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Start your library' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add books' })).toHaveCount(1)
  await expect(page.getByRole('searchbox')).toHaveCount(0)
})

test('names an icon button in a tip while the pointer rests on it, until it is pressed', async ({
  page,
}) => {
  const tip = page.locator('[popover][aria-hidden]')
  await page.getByRole('button', { name: 'Settings' }).hover()
  await expect(tip).toBeVisible()
  await expect(tip).toHaveText('Settings')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await expect(tip).toBeHidden()
})

test('takes books dropped on the page, and puts the drop target away when a drag leaves', async ({
  page,
}) => {
  const drag = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['Just some notes.'], 'notes.md', { type: 'text/markdown' }))
    return transfer
  })
  const target = page.getByText('Drop to add to your library')
  // A drag that leaves without the page hearing its dragleave (the browser drops it when
  // the pointer goes out fast) stops sending dragover all the same.
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: drag })
  await expect(target).toBeVisible()
  await expect(target).toBeHidden()
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: drag })
  await page.dispatchEvent('body', 'drop', { dataTransfer: drag })
  await expect(target).toBeHidden()
  await expect(page.getByRole('alert')).toContainText('“notes.md” couldn’t be added.')
})

test('adds a book with its title, author and cover', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  await expect(page.getByRole('status')).toContainText('Added “The Test Book”.')
  const card = page.getByRole('listitem').filter({ hasText: 'The Test Book' })
  await expect(card).toContainText('Ada Lovelace')
  await expect(card).not.toContainText('%')
  await expect(card.locator('img')).toHaveJSProperty('complete', true)
})

test('labels each book with its format, on its cover and in the list', async ({ page }) => {
  await addBooks(page, fixtures.epub(), fixtures.pdf(), fixtures.plainText())
  await expect(page.getByRole('status')).toContainText('Added 3 books.')
  const formats = {
    'The Test Book': 'EPUB',
    'A Portable Document': 'PDF',
    'A Plain Text Book': 'TXT',
  }
  for (const [title, format] of Object.entries(formats)) {
    await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText(format)
  }
  await page.getByRole('radio', { name: 'List' }).check({ force: true })
  for (const [title, format] of Object.entries(formats)) {
    await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText(format)
  }
})

test('reads a PDF’s title and author', async ({ page }) => {
  await addBooks(page, fixtures.pdf())
  const card = page.getByRole('listitem').filter({ hasText: 'A Portable Document' })
  await expect(card).toContainText('Grace Hopper')
})

test('says when a book is already in the library', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  await expect(page.getByRole('status')).toContainText('Added')
  await addBooks(page, fixtures.epub())
  await expect(page.getByRole('status')).toContainText(
    '“The Test Book” is already in your library.',
  )
  await expect(page.getByRole('listitem')).toHaveCount(1)
})

test('explains why a file that is not a book was not added', async ({ page }) => {
  await addBooks(page, fixtures.notes())
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('“notes.md” couldn’t be added.')
  await expect(alert).toContainText('It isn’t in a format Carrel reads')
})

test('removes a book only after asking', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  await page.getByRole('button', { name: 'More actions for The Test Book' }).click()
  await page.getByRole('button', { name: 'Remove from library…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove “The Test Book”?' })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)

  await page.getByRole('button', { name: 'More actions for The Test Book' }).click()
  await page.getByRole('button', { name: 'Remove from library…' }).click()
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('heading', { name: 'Start your library' })).toBeVisible()
})

test('finds books by title or author', async ({ page }) => {
  await addBooks(page, fixtures.epub(), fixtures.pdf())
  await expect(page.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Search your library' }).fill('hopper')
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('listitem')).toContainText('A Portable Document')
  await page.getByRole('searchbox', { name: 'Search your library' }).fill('nothing like this')
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(2)
})

test('names a book by its first page when nothing else names it', async ({ page }) => {
  await addBooks(page, fixtures.anonymousPdf())
  await expect(page.getByRole('status')).toContainText('Added “Page 1 of the portable document”.')
})
