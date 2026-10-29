import { describe, expect, it } from 'vitest'
import { arrangeBooks } from '@/domain/arrange'
import type { Book } from '@/domain/db'

const book = (title: string, authors: string[], addedAt: number, openedAt: number | null = null) =>
  ({ id: title, title, authors, language: null, format: 'EPUB', addedAt, openedAt }) satisfies Book

const library = [
  book('Émile', ['Jean-Jacques Rousseau'], 1, 50),
  book('Book 10', ['Anon'], 2),
  book('Book 9', [], 3),
  book('Middlemarch', ['George Eliot'], 4, 10),
]

const titles = (books: Book[]) => books.map((b) => b.title)

describe('arrangeBooks', () => {
  it('orders by the later of opening and adding, most recent first', () => {
    expect(titles(arrangeBooks(library, 'recent', ''))).toEqual([
      'Émile',
      'Middlemarch',
      'Book 9',
      'Book 10',
    ])
  })

  it('orders titles the way people read numbers', () => {
    expect(titles(arrangeBooks(library, 'title', ''))).toEqual([
      'Book 9',
      'Book 10',
      'Émile',
      'Middlemarch',
    ])
  })

  it('puts books without an author last when ordering by author', () => {
    expect(titles(arrangeBooks(library, 'author', '')).at(-1)).toBe('Book 9')
  })

  it('matches every word, ignoring case and accents, across title and author', () => {
    expect(titles(arrangeBooks(library, 'title', 'emile ROUSS'))).toEqual(['Émile'])
    expect(titles(arrangeBooks(library, 'title', 'eliot emile'))).toEqual([])
  })

  it('does not reorder the list it was given', () => {
    const input = [...library]
    arrangeBooks(input, 'title', '')
    expect(input).toEqual(library)
  })
})
