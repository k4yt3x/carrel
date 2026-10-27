import { useSyncExternalStore } from 'react'
import { parseRoute } from '@/domain/routes'
import { LibraryPage } from '@/ui/library/LibraryPage'
import { UpdateNotice } from '@/ui/library/UpdateNotice'
import { ReaderPage } from '@/ui/reader/ReaderPage'
import { useLaunchFiles } from '@/ui/useLaunchFiles'
import { useThemeEffect } from '@/ui/useTheme'

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

export function App() {
  useThemeEffect()
  useLaunchFiles()
  const route = parseRoute(useSyncExternalStore(subscribe, getHash))
  return (
    <>
      {route.name === 'reader' ? (
        <ReaderPage key={route.bookId} bookId={route.bookId} />
      ) : (
        <LibraryPage />
      )}
      <UpdateNotice shown={route.name === 'library'} />
    </>
  )
}
