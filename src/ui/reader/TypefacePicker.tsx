import { useEffect, useId, useState } from 'react'
import type { Font } from '@/domain/db'
import type { Typeface } from '@/domain/settings'
import {
  canListSystemFonts,
  installedCommonFamilies,
  isFontInstalled,
  loadSystemFontsIfAllowed,
  useSystemFonts,
} from '@/ui/fonts/systemFonts'

interface TypefacePickerProps {
  value: Typeface
  fonts: Pick<Font, 'id' | 'family'>[]
  onChange(typeface: Typeface): void
  onManageFonts(): void
}

// Choices in the select that are actions rather than typefaces.
const listDeviceFonts = 'action:list'
const typeFontName = 'action:type'

function optionValue(typeface: Typeface): string {
  if (typeof typeface === 'string') return typeface
  return 'fontId' in typeface ? `font:${typeface.fontId}` : `device:${typeface.family}`
}

function fromOptionValue(value: string): Typeface {
  if (value.startsWith('font:')) return { fontId: value.slice('font:'.length) }
  if (value.startsWith('device:')) return { family: value.slice('device:'.length) }
  return value as Typeface
}

/**
 * The typeface for book text: the book's own, a generic serif or sans-serif, a font the reader
 * added, or one installed on the device. The device's common reading fonts are listed at once;
 * where the browser can list every font it does so on request (it asks permission once), and
 * elsewhere the reader can type the name of a font outside the common ones.
 */
export function TypefacePicker({ value, fonts, onChange, onManageFonts }: TypefacePickerProps) {
  const { families, status, load } = useSystemFonts()
  const listable = canListSystemFonts() && status !== 'denied' && status !== 'failed'
  const deviceFamily = typeof value === 'object' && 'family' in value ? value.family : null
  // Measured once, when the settings first open.
  const [common] = useState(installedCommonFamilies)
  const [typing, setTyping] = useState(false)
  const listed = status === 'loaded' ? families : common
  // The name field is for a font typed by hand: one asked for, or one chosen that isn't listed.
  const showNameField =
    !listable && (typing || (deviceFamily !== null && !listed.includes(deviceFamily)))
  const fieldId = useId()

  useEffect(() => {
    loadSystemFontsIfAllowed()
  }, [])

  // A typeface whose added font was removed falls back to the book's; the select shows that.
  const missingFont =
    typeof value === 'object' && 'fontId' in value && !fonts.some((f) => f.id === value.fontId)
  const selected = missingFont ? 'book' : optionValue(value)
  // The chosen device font stays listed even before (or without) the device's list.
  const deviceOptions =
    deviceFamily && !listed.includes(deviceFamily) ? [deviceFamily, ...listed] : listed

  const choose = (option: string) => {
    if (option === listDeviceFonts) {
      load()
      return
    }
    if (option === typeFontName) {
      setTyping(true)
      return
    }
    setTyping(false)
    onChange(fromOptionValue(option))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <label className="block min-w-0 flex-1">
          <span className="mb-2 block text-sm text-fg-secondary">Typeface</span>
          <select
            className="select w-full"
            value={selected}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="book">Book’s own</option>
            <option value="serif">Serif</option>
            <option value="sans">Sans-serif</option>
            {fonts.length > 0 && (
              <optgroup label="Your fonts">
                {fonts.map((font) => (
                  <option key={font.id} value={`font:${font.id}`}>
                    {font.family}
                  </option>
                ))}
              </optgroup>
            )}
            {deviceOptions.length > 0 && (
              <optgroup label="On this device">
                {deviceOptions.map((family) => (
                  <option key={family} value={`device:${family}`}>
                    {family}
                  </option>
                ))}
              </optgroup>
            )}
            {listable && status !== 'loaded' && (
              <option value={listDeviceFonts}>All fonts on this device…</option>
            )}
            {!listable && <option value={typeFontName}>Type a font name…</option>}
          </select>
        </label>
        <button type="button" className="btn btn-ghost" onClick={onManageFonts}>
          {fonts.length > 0 ? 'Fonts…' : 'Add font…'}
        </button>
      </div>

      {status === 'loading' && (
        <p className="text-xs text-fg-muted" role="status">
          Listing fonts…
        </p>
      )}
      {status === 'denied' && (
        <p className="text-xs leading-normal text-fg-muted" role="status">
          Not allowed to list fonts. Type a font’s name instead.
        </p>
      )}
      {status === 'failed' && (
        <p className="text-xs leading-normal text-danger-fg" role="alert">
          Couldn’t list fonts. Type a font’s name instead.
        </p>
      )}

      {showNameField && (
        <FontNameField
          id={fieldId}
          family={deviceFamily}
          onApply={(family) => onChange(family ? { family } : 'book')}
        />
      )}
    </div>
  )
}

function FontNameField({
  id,
  family,
  onApply,
}: {
  id: string
  family: string | null
  onApply(family: string): void
}) {
  const [draft, setDraft] = useState(family ?? '')
  const apply = () => {
    if (draft.trim() !== (family ?? '')) onApply(draft.trim())
  }
  const missing = family !== null && !isFontInstalled(family)
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm text-fg-secondary">
        Font name
      </label>
      <input
        id={id}
        className="input w-full bg-surface-sunken"
        placeholder="Georgia"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply()
        }}
      />
      {missing && (
        <p className="mt-2 text-xs leading-normal text-fg-muted" role="status">
          Not installed on this device
        </p>
      )}
    </div>
  )
}
