/** Width of stored cover thumbnails: twice the widest a cover is drawn in the library. */
const thumbnailWidth = 512

async function decode(image: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(image)
  } catch {
    // createImageBitmap refuses SVG, which some EPUBs use for their cover; an <img> decodes it.
    const element = new Image()
    const url = URL.createObjectURL(image)
    try {
      element.src = url
      await element.decode()
      return element
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

export interface Thumbnail {
  image: Blob
  width: number
  height: number
}

/**
 * Scales a cover image down to a thumbnail, so the library never decodes a full-size scan
 * just to draw a grid of covers. Returns null for an image the browser cannot decode.
 */
export async function makeThumbnail(image: Blob): Promise<Thumbnail | null> {
  let source: Awaited<ReturnType<typeof decode>>
  try {
    source = await decode(image)
  } catch {
    return null
  }
  if (!source.width || !source.height) return null
  const scale = Math.min(1, thumbnailWidth / source.width)
  const canvas = new OffscreenCanvas(
    Math.round(source.width * scale),
    Math.round(source.height * scale),
  )
  const context = canvas.getContext('2d')
  if (!context) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source) source.close()
  const thumbnail = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
  return { image: thumbnail, width: canvas.width, height: canvas.height }
}
