import { useEffect, useState } from 'react'
import { formatBytes } from '@/ui/format'
import { InfoTip } from '@/ui/InfoTip'

interface Storage {
  usage: number | null
  quota: number | null
  persisted: boolean
}

type Request = 'idle' | 'asking' | 'declined' | 'failed'

/**
 * The storage manager, which browsers offer only to secure contexts (https: and localhost); a
 * page opened over plain http, such as a development server reached by its network address,
 * has none.
 */
const storageManager = (): StorageManager | undefined => navigator.storage

/**
 * How much room the library takes, and whether the browser has promised to keep it. Browsers
 * clear a site's storage under pressure unless it is persisted, which only the browser (or
 * the reader, when the browser asks) can grant.
 */
export function StorageSection({ open }: { open: boolean }) {
  const [storage, setStorage] = useState<Storage | 'failed' | null>(null)
  const [request, setRequest] = useState<Request>('idle')

  // Read afresh each time the settings open, since the library changes in between.
  useEffect(() => {
    if (!open || !storageManager()) return
    let cancelled = false
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted()])
      .then(([estimate, persisted]) => {
        if (cancelled) return
        setStorage({ usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted })
      })
      .catch((error: unknown) => {
        console.error('could not read the storage estimate', error)
        if (!cancelled) setStorage('failed')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const persist = async () => {
    setRequest('asking')
    try {
      const persisted = await navigator.storage.persist()
      setStorage((current) =>
        typeof current === 'object' && current ? { ...current, persisted } : current,
      )
      setRequest(persisted ? 'idle' : 'declined')
    } catch (error) {
      console.error('could not ask for persistent storage', error)
      setRequest('failed')
    }
  }

  if (!storageManager()) {
    return (
      <p className="text-sm text-fg-secondary">Storage details need a secure (https) connection.</p>
    )
  }
  if (!storage) return null
  if (storage === 'failed') {
    return <p className="text-sm text-fg-secondary">The browser couldn’t say how much is stored.</p>
  }
  return (
    <div className="space-y-4 text-sm leading-normal">
      {storage.usage !== null && (
        <p className="text-fg-secondary">
          {formatBytes(storage.usage)} used
          {storage.quota !== null && ` of ${formatBytes(storage.quota)}`}
        </p>
      )}
      {storage.persisted ? (
        <p className="text-fg-secondary">Protected from automatic clearing</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" className="btn" disabled={request === 'asking'} onClick={persist}>
            Protect from clearing
          </button>
          <InfoTip label="About protecting your library">
            Browsers may clear a site’s storage when space runs low, unless they agree to keep it.
            Some decide by how often you visit, or once Carrel is installed as an app.
          </InfoTip>
          {request === 'declined' && (
            <p className="text-fg-muted" role="status">
              The browser declined.
            </p>
          )}
          {request === 'failed' && (
            <p className="text-danger-fg" role="alert">
              The browser couldn’t be asked.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
