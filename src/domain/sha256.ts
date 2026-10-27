import { createSHA256 } from 'hash-wasm'

/**
 * SHA-256 of a blob's bytes as lowercase hex.
 *
 * The blob is read as a stream, so memory stays flat however large the file is, and the
 * awaits between chunks keep the page responsive while a big PDF is hashed. WebCrypto's
 * digest() cannot do either: it takes the whole buffer at once.
 */
export async function sha256(blob: Blob): Promise<string> {
  const hasher = await createSHA256()
  hasher.init()
  const reader = blob.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    hasher.update(value)
  }
  return hasher.digest('hex')
}
