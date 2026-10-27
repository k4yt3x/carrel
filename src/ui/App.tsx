import { useSyncExternalStore } from 'react'
import { parseRoute } from '@/domain/routes'
import { LibraryPage } from '@/ui/library/LibraryPage'
import { ReaderPage } from '@/ui/reader/ReaderPage'

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

export function App() {
  const route = parseRoute(useSyncExternalStore(subscribe, getHash))
  if (route.name === 'reader') return <ReaderPage key={route.bookId} bookId={route.bookId} />
  return <LibraryPage />
}
