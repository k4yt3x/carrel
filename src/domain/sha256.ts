import { createSHA256 } from 'hash-wasm'

/**
 * SHA-256 of a blob's bytes as lowercase hex.
 *
 * The blob is read as a stream, so memory stays flat however large the file is, and the
 * awaits between chunks keep the page responsive while a big PDF is hashed. WebCrypto's
 * digest() cannot do either: it takes the whole buffer at once.
 */
export async function sha256(blob: Blob): Promise<string> {
  let hasher: Awaited<ReturnType<typeof createSHA256>>
  try {
    hasher = await createSHA256()
  } catch (error) {
    // Lockdown Mode on iPhone, iPad and Mac turns WebAssembly off. WebCrypto gives the same
    // digest, of the whole file at once.
    console.warn('hashing without WebAssembly', error)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  hasher.init()
  const reader = blob.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    hasher.update(value)
  }
  return hasher.digest('hex')
}
