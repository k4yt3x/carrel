import { useEffect, useSyncExternalStore } from 'react'
import { db } from '@/domain/db'

export interface CoverImage {
  url: string
  /** Pixel size of the image, so it is laid out before it loads. */
  width: number
  height: number
}

/*
 * The covers the library has shown, kept for the whole visit. Each is read from the database
 * once, together with the others asked for at the same time, and keeps one object URL, so a
 * book that is drawn again (on coming back from reading, choosing books, a search that hides
 * it and shows it again) has its cover at once. A book's cover never changes: it is stored
 * with the book and removed with it.
 */
const covers = new Map<string, CoverImage | null>()
const listeners = new Set<() => void>()
let wanted = new Set<string>()
const reading = new Set<string>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const changed = () => {
  for (const listener of listeners) listener()
}

async function readWanted() {
  const ids = [...wanted]
  wanted = new Set()
  for (const id of ids) reading.add(id)
  try {
    const records = await db.covers.bulkGet(ids)
    ids.forEach((id, index) => {
      // Removed while it was being read.
      if (!reading.has(id)) return
      const record = records[index]
      covers.set(
        id,
        record
          ? { url: URL.createObjectURL(record.image), width: record.width, height: record.height }
          : null,
      )
    })
    changed()
  } catch (error) {
    // Left unknown, so the next card to show one of these books asks again.
    console.error('could not read covers', error)
  } finally {
    for (const id of ids) reading.delete(id)
  }
}

function request(id: string) {
  if (covers.has(id) || reading.has(id) || wanted.has(id)) return
  wanted.add(id)
  // The cards drawn in one go ask in one go; they are read in one query.
  if (wanted.size === 1) queueMicrotask(readWanted)
}

/** A book's cover: undefined until it has been read, null for a book without one. */
export function useCover(id: string): CoverImage | null | undefined {
  const cover = useSyncExternalStore(subscribe, () => covers.get(id))
  useEffect(() => request(id), [id])
  return cover
}

/** Lets go of removed books' covers. */
export function forgetCovers(ids: readonly string[]) {
  for (const id of ids) {
    const cover = covers.get(id)
    if (cover) URL.revokeObjectURL(cover.url)
    covers.delete(id)
    reading.delete(id)
    wanted.delete(id)
  }
  changed()
}
