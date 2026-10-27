import { useEffect, useState } from 'react'
import type { Font } from '@/domain/db'
import { fontFaceRules } from '@/domain/fonts'

/**
 * @font-face rules for a font the reader added, pointing at object URLs for its files. Book
 * pages are documents of their own and can't use fonts loaded into the app's document, so
 * the rules go into each page; the URLs live as long as the font is in use.
 */
export function useFontFaces(font: Font | undefined): string {
  const [css, setCss] = useState('')
  useEffect(() => {
    if (!font) {
      setCss('')
      return
    }
    const urls: string[] = []
    setCss(
      fontFaceRules(font, (file) => {
        const url = URL.createObjectURL(file.data)
        urls.push(url)
        return url
      }),
    )
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [font])
  return css
}
