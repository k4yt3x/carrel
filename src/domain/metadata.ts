/**
 * foliate-js reports metadata in the shape each format happens to have: a title may be a
 * string or a map from language to string, authors may be strings, objects with a `name`,
 * or a list of either. This reduces all of them to the fields the library shows.
 */

export interface BookMetadata {
  title: string
  authors: string[]
  language: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

/** A plain string, or the first entry of a language map. */
function text(value: unknown): string | null {
  if (typeof value === 'string') return clean(value) || null
  if (isRecord(value)) {
    for (const entry of Object.values(value)) {
      const found = typeof entry === 'string' ? clean(entry) : ''
      if (found) return found
    }
  }
  return null
}

function contributors(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value]
  const names = list.map((item) =>
    isRecord(item) && 'name' in item ? text(item.name) : text(item),
  )
  return [...new Set(names.filter((name): name is string => name !== null))]
}

function language(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value
  if (typeof first !== 'string' || !first.trim()) return null
  try {
    return Intl.getCanonicalLocales(first.trim())[0] ?? null
  } catch {
    return null
  }
}

/** The file name without the book extensions, for books whose metadata has no title. */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.(fb2\.zip|[a-z0-9]{1,5})$/i, '')
  return clean(base.replace(/[_]+/g, ' ')) || fileName
}

export function normalizeMetadata(raw: unknown, fileName: string): BookMetadata {
  const metadata = isRecord(raw) ? raw : {}
  return {
    title: text(metadata.title) ?? titleFromFileName(fileName),
    authors: contributors(metadata.author),
    language: language(metadata.language),
  }
}
