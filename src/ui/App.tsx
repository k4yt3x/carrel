import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { parseRoute } from '@/domain/routes'
import { ImportNotice } from '@/ui/library/ImportNotice'
import { LibraryPage } from '@/ui/library/LibraryPage'
import { UpdateNotice } from '@/ui/library/UpdateNotice'
import { Tooltips } from '@/ui/Tooltips'
import { useLaunchFiles } from '@/ui/useLaunchFiles'
import { useThemeEffect } from '@/ui/useTheme'

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

// The reader is most of the app's code, and isn't needed to show the library. It loads on its
// own, once the library has had its moment, so a book opens without waiting for it.
const loadReader = () => import('@/ui/reader/ReaderPage')
const ReaderPage = lazy(async () => ({ default: (await loadReader()).ReaderPage }))
const readerPreloadMs = 2000

export function App() {
  useThemeEffect()
  useLaunchFiles()
  const route = parseRoute(useSyncExternalStore(subscribe, getHash))
  useEffect(() => {
    const timer = setTimeout(() => {
      loadReader().catch((error: unknown) => console.error('could not load the reader', error))
    }, readerPreloadMs)
    return () => clearTimeout(timer)
  }, [])
  return (
    <>
      {route.name === 'reader' ? (
        // The page stays blank for the moment the reader takes to load, if it hasn't yet.
        <Suspense fallback={null}>
          <ReaderPage key={route.bookId} bookId={route.bookId} />
        </Suspense>
      ) : (
        <LibraryPage />
      )}
      <Tooltips />
      {/* Notices stack in a corner of the library, so two at once don't cover each other, and
          clear of the system's edges: a notch beside them, the home indicator below. */}
      <div className="fixed right-[calc(16px+env(safe-area-inset-right))] bottom-[calc(16px+env(safe-area-inset-bottom))] left-[calc(16px+env(safe-area-inset-left))] z-60 flex flex-col gap-3 sm:right-[calc(32px+env(safe-area-inset-right))] sm:bottom-[calc(32px+env(safe-area-inset-bottom))] sm:left-auto sm:w-96">
        <UpdateNotice shown={route.name === 'library'} />
        {route.name === 'library' && <ImportNotice />}
      </div>
    </>
  )
}
