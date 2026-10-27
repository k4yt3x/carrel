import { expect, type Page, test } from '@playwright/test'
import { type FixtureFile, fixtures } from './fixtures'

const addBooks = (page: Page, ...files: FixtureFile[]) =>
  page.locator('input[type="file"]').setInputFiles(files)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('an empty library explains itself and offers to add books', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Start your library' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add books' })).toHaveCount(1)
  await expect(page.getByRole('searchbox')).toHaveCount(0)
})

test('adds a book with its title, author and cover', async ({ page }) => {
  await addBooks(page, fixtures.epub())
  await expect(page.getByRole('status')).toContainText('Added “The Test Book”.')
  const card = page.getByRole('listitem').filter({ hasText: 'The Test Book' })
  await expect(card).toContainText('Ada Lovelace')
  await expect(card).not.toContainText('%')
  await expect(card.locator('img')).toHaveJSProperty('complete', true)
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
  await addBooks(page, fixtures.text())
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('“notes.txt” couldn’t be added.')
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
