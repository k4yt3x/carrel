/**
 * Routes live in the URL fragment. GitHub Pages serves the same index.html only at `/`, so a
 * path-based route would 404 on reload; a fragment never reaches the server.
 */

export type Route = { name: 'library' } | { name: 'reader'; bookId: string }

const readerPattern = /^#\/read\/([0-9a-f]{64})$/

export function parseRoute(hash: string): Route {
  const match = readerPattern.exec(hash)
  return match?.[1] ? { name: 'reader', bookId: match[1] } : { name: 'library' }
}

export const libraryHref = '#/'

export const readerHref = (bookId: string) => `#/read/${bookId}`
