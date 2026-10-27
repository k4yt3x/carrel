import { useEffect, useState } from 'react'
import { formatBytes } from '@/ui/format'

interface Storage {
  usage: number | null
  quota: number | null
  persisted: boolean
}

type Request = 'idle' | 'asking' | 'declined' | 'failed'

/**
 * How much room the library takes, and whether the browser has promised to keep it. Browsers
 * clear a site's storage under pressure unless it is persisted, which only the browser (or
 * the reader, when the browser asks) can grant.
 */
export function StorageSection({ open }: { open: boolean }) {
  const [storage, setStorage] = useState<Storage | null>(null)
  const [request, setRequest] = useState<Request>('idle')

  // Read afresh each time the settings open, since the library changes in between.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted()])
      .then(([estimate, persisted]) => {
        if (cancelled) return
        setStorage({ usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted })
      })
      .catch((error: unknown) => console.error('could not read the storage estimate', error))
    return () => {
      cancelled = true
    }
  }, [open])

  const persist = async () => {
    setRequest('asking')
    try {
      const persisted = await navigator.storage.persist()
      setStorage((current) => (current ? { ...current, persisted } : current))
      setRequest(persisted ? 'idle' : 'declined')
    } catch (error) {
      console.error('could not ask for persistent storage', error)
      setRequest('failed')
    }
  }

  if (!storage) return null
  return (
    <div className="space-y-4 text-sm leading-normal">
      {storage.usage !== null && (
        <p className="text-fg-secondary">
          Carrel is using {formatBytes(storage.usage)}
          {storage.quota !== null && ` of the ${formatBytes(storage.quota)} this browser allows it`}
          .
        </p>
      )}
      {storage.persisted ? (
        <p className="text-fg-secondary">
          The browser will keep your library even when space runs low.
        </p>
      ) : (
        <>
          <p className="text-fg-secondary">
            The browser may clear your library when space runs low. Ask it to keep the library, and
            back it up either way.
          </p>
          <button type="button" className="btn" disabled={request === 'asking'} onClick={persist}>
            Ask the browser to keep it
          </button>
          {request === 'declined' && (
            <p className="text-fg-muted" role="status">
              The browser declined. Some browsers decide by how often you visit, or agree once
              Carrel is installed as an app.
            </p>
          )}
          {request === 'failed' && (
            <p className="text-danger-fg" role="alert">
              The browser couldn’t be asked. Try again.
            </p>
          )}
        </>
      )}
    </div>
  )
}
