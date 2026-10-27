import { useSyncExternalStore } from 'react'
import { parseRoute } from '@/domain/routes'
import { ImportNotice } from '@/ui/library/ImportNotice'
import { LibraryPage } from '@/ui/library/LibraryPage'
import { UpdateNotice } from '@/ui/library/UpdateNotice'
import { ReaderPage } from '@/ui/reader/ReaderPage'
import { Tooltips } from '@/ui/Tooltips'
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
      <Tooltips />
      {/* Notices stack in a corner of the library, so two at once don't cover each other. */}
      <div className="fixed inset-x-4 bottom-4 z-60 flex flex-col gap-3 sm:start-auto sm:end-8 sm:bottom-8 sm:w-96">
        <UpdateNotice shown={route.name === 'library'} />
        {route.name === 'library' && <ImportNotice />}
      </div>
    </>
  )
}
