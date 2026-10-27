/**
 * The fonts installed on the device, for setting books in.
 *
 * An installed font needs no loading: book pages can name its family like any other. Browsers
 * don't let a page list them freely, since the list tells sites apart (fingerprinting). So:
 *
 * - Every browser gets the common reading fonts that are installed, found by measuring them
 *   (`installedCommonFamilies`), with no prompt.
 * - Chromium-based browsers can list every font with the Local Font Access API, which asks the
 *   reader's permission once (`useSystemFonts`).
 * - Elsewhere, a font outside the common ones is typed by name, and `isFontInstalled` checks
 *   that the name matches a font.
 */

import { create } from 'zustand'
import { cssString } from '@/domain/fonts'

interface FontData {
  family: string
}

type QueryLocalFonts = () => Promise<FontData[]>

const queryLocalFonts = () =>
  (window as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts?.bind(window)

/** Whether this browser can list the device's fonts. */
export const canListSystemFonts = () => queryLocalFonts() !== undefined

type Status = 'idle' | 'loading' | 'loaded' | 'denied' | 'failed'

interface SystemFontsState {
  families: string[]
  status: Status
  /** Lists the fonts, asking permission if needed; call it from a click or a choice. */
  load(): Promise<void>
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/** The device's font families, once listed; kept for the session, not stored. */
export const useSystemFonts = create<SystemFontsState>()((set, get) => ({
  families: [],
  status: 'idle',
  async load() {
    const query = queryLocalFonts()
    if (!query || get().status === 'loading' || get().status === 'loaded') return
    set({ status: 'loading' })
    try {
      const fonts = await query()
      const families = [...new Set(fonts.map((font) => font.family))].sort(collator.compare)
      set({ families, status: 'loaded' })
    } catch (error) {
      // A refused permission is a DOMException named NotAllowedError (or SecurityError when
      // the request didn't come from a click).
      const denied =
        error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)
      if (!denied) console.error('could not list the fonts on this device', error)
      set({ status: denied ? 'denied' : 'failed' })
    }
  },
}))

/**
 * Lists the device's fonts without asking, when the reader allowed it in an earlier visit, so
 * the list is there when the settings open.
 */
export async function loadSystemFontsIfAllowed(): Promise<void> {
  if (!canListSystemFonts()) return
  try {
    const permission = await navigator.permissions.query({ name: 'local-fonts' as PermissionName })
    if (permission.state === 'granted') await useSystemFonts.getState().load()
  } catch (error) {
    // Browsers that don't know the permission name can still list fonts after a click.
    console.warn('could not check the permission to list fonts', error)
  }
}

let canvas: CanvasRenderingContext2D | null | undefined

/**
 * Whether a font family is installed, found by setting sample text in it and seeing whether
 * the width differs from the generic families it would otherwise fall back to.
 */
export function isFontInstalled(family: string): boolean {
  canvas ??= document.createElement('canvas').getContext('2d')
  if (!canvas) return true
  const context = canvas
  const sample = 'mmmmmmmmmmlli1WQ@ 漢字'
  const quoted = cssString(family)
  return ['monospace', 'serif', 'sans-serif'].some((fallback) => {
    context.font = `72px ${fallback}`
    const plain = context.measureText(sample).width
    context.font = `72px ${quoted}, ${fallback}`
    return context.measureText(sample).width !== plain
  })
}

/**
 * Fonts worth reading in that devices commonly have: those of Windows, macOS, iOS, Android and
 * the Linux distributions, the families people install for reading, and the CJK families.
 */
const commonFamilies = [
  // Serif
  'Alegreya',
  'Baskerville',
  'Bitstream Charter',
  'Book Antiqua',
  'Cambria',
  'Charis SIL',
  'Charter',
  'Constantia',
  'Cormorant Garamond',
  'Crimson Pro',
  'Crimson Text',
  'DejaVu Serif',
  'Droid Serif',
  'EB Garamond',
  'Garamond',
  'Gentium Plus',
  'Georgia',
  'Hoefler Text',
  'Iowan Old Style',
  'Libertinus Serif',
  'Liberation Serif',
  'Libre Baskerville',
  'Linux Libertine O',
  'Literata',
  'Lora',
  'Merriweather',
  'Noto Serif',
  'Palatino',
  'Palatino Linotype',
  'PT Serif',
  'Sitka Text',
  'Source Serif 4',
  'Source Serif Pro',
  'Spectral',
  'Times New Roman',
  'Tinos',
  'Vollkorn',
  // Sans-serif
  'Arial',
  'Arimo',
  'Atkinson Hyperlegible',
  'Avenir',
  'Avenir Next',
  'Calibri',
  'Candara',
  'Cantarell',
  'Corbel',
  'DejaVu Sans',
  'Fira Sans',
  'Futura',
  'Gill Sans',
  'Helvetica',
  'Helvetica Neue',
  'IBM Plex Sans',
  'Inter',
  'Lato',
  'Lexend',
  'Liberation Sans',
  'Noto Sans',
  'Open Sans',
  'OpenDyslexic',
  'Optima',
  'PT Sans',
  'Roboto',
  'Segoe UI',
  'Source Sans 3',
  'Source Sans Pro',
  'Tahoma',
  'Trebuchet MS',
  'Ubuntu',
  'Verdana',
  // Chinese, Japanese and Korean
  'Apple SD Gothic Neo',
  'AppleMyungjo',
  'Batang',
  'HarmonyOS Sans SC',
  'Hiragino Kaku Gothic ProN',
  'Hiragino Mincho ProN',
  'Hiragino Sans',
  'LXGW WenKai',
  'Malgun Gothic',
  'Meiryo',
  'Microsoft JhengHei',
  'Microsoft YaHei',
  'MiSans',
  'MS Mincho',
  'Noto Sans CJK JP',
  'Noto Sans CJK KR',
  'Noto Sans CJK SC',
  'Noto Sans CJK TC',
  'Noto Serif CJK JP',
  'Noto Serif CJK KR',
  'Noto Serif CJK SC',
  'Noto Serif CJK TC',
  'PingFang SC',
  'PingFang TC',
  'Sarasa Gothic SC',
  'SimSun',
  'Songti SC',
  'Source Han Sans SC',
  'Source Han Serif SC',
  'STSong',
  'WenQuanYi Micro Hei',
  'Yu Gothic',
  'Yu Mincho',
]

let installedCommon: string[] | undefined

/**
 * The common reading fonts installed on this device, in alphabetical order. Measured once a
 * session: a few hundred text measurements, which take a few milliseconds.
 */
export function installedCommonFamilies(): string[] {
  installedCommon ??= commonFamilies
    .filter((family) => isFontInstalled(family))
    .sort(collator.compare)
  return installedCommon
}
