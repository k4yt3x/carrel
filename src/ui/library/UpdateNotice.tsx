import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

/** How often a long-open page asks whether a new version has been published. */
const checkEveryMs = 60 * 60 * 1000

/**
 * Offers a new version once the service worker has downloaded it. The update waits for the
 * reader to choose it rather than taking over the open page: switching versions under a
 * running page can leave it asking for script files the new version no longer has.
 *
 * Mounted on every page, so the service worker is registered wherever the app is opened;
 * the notice itself waits for the library rather than covering a book being read.
 */
export function UpdateNotice({ shown }: { shown: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        registration.update().catch((error: unknown) => {
          console.warn('could not check for a new version', error)
        })
      }, checkEveryMs)
    },
    onRegisterError(error: unknown) {
      console.error('could not register the service worker', error)
    },
  })

  if (!needRefresh || !shown) return null
  return (
    <div className="fixed inset-x-4 bottom-4 z-60 sm:start-8 sm:end-auto sm:bottom-8 sm:w-96">
      <div
        role="status"
        className="flex items-center gap-3 rounded-lg bg-surface-raised p-4 shadow-xl"
      >
        <p className="min-w-0 flex-1 text-sm font-semibold text-fg">
          A new version of Carrel is ready.
        </p>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            updateServiceWorker().catch((error: unknown) => {
              console.error('could not switch to the new version', error)
            })
          }}
        >
          <RefreshCw aria-hidden className="size-4" />
          Reload
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square -me-2 text-fg-muted"
          aria-label="Not now"
          onClick={() => setNeedRefresh(false)}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}
