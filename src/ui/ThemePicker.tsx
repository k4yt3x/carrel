import { Pencil, Plus } from 'lucide-react'
import { type CSSProperties, useId, useState } from 'react'
import { newId } from '@/domain/ids'
import type { BuiltinTheme, Theme } from '@/domain/settings'
import { type CustomTheme, customThemeLimit, customThemeRef } from '@/domain/themes'
import { useAppSettings } from '@/store/appSettings'
import { ThemeEditor } from '@/ui/ThemeEditor'

// Each built-in swatch is painted with the theme's own page and text primitives, which stay
// the same whichever theme is active, so the themes can be compared side by side.
const builtins: { value: BuiltinTheme; label: string; page: string; text: string }[] = [
  {
    value: 'system',
    label: 'Auto',
    page: 'bg-[linear-gradient(135deg,var(--color-neutral-50)_50%,var(--color-neutral-950)_50%)]',
    text: 'text-neutral-500',
  },
  { value: 'light', label: 'Light', page: 'bg-neutral-50', text: 'text-neutral-900' },
  { value: 'dark', label: 'Dark', page: 'bg-neutral-950', text: 'text-neutral-200' },
]

const swatch =
  'grid h-16 w-full place-items-center rounded-lg font-serif text-lg ring-1 ring-border peer-checked:ring-2 peer-checked:ring-action peer-checked:ring-offset-2 peer-checked:ring-offset-surface-raised peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus'
const caption =
  'max-w-full truncate text-xs text-fg-secondary peer-checked:font-semibold peer-checked:text-fg'

/** An opaque CSS colour as #rrggbb, read through a canvas; the fallback for anything else. */
function toHex(color: string, fallback: string): string {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return fallback
  context.fillStyle = fallback
  context.fillStyle = color
  const result = context.fillStyle
  return /^#[0-9a-f]{6}$/i.test(result) ? result : fallback
}

/** A new theme starts from the colours on screen, so it is a change from what the reader sees. */
function startingTheme(): CustomTheme {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) =>
    toHex(style.getPropertyValue(name).trim(), fallback)
  return {
    id: newId(),
    name: '',
    background: token('--color-surface', '#f7f9f9'),
    text: token('--color-fg', '#2b2b31'),
    link: token('--color-action-fg', '#2b2b31'),
  }
}

/** The app's theme, which book pages follow too: one of Carrel's, or one the reader made. */
export function ThemePicker({ value, onChange }: { value: Theme; onChange(theme: Theme): void }) {
  const name = useId()
  const customThemes = useAppSettings((state) => state.customThemes)
  const saveCustomTheme = useAppSettings((state) => state.saveCustomTheme)
  const deleteCustomTheme = useAppSettings((state) => state.deleteCustomTheme)
  const [editing, setEditing] = useState<{ theme: CustomTheme; existing: boolean } | null>(null)
  const full = customThemes.length >= customThemeLimit

  return (
    // No spacing between children: the editor dialog, while open, is one of them and would
    // push the swatches apart.
    <div>
      <fieldset>
        <legend className="sr-only">Theme</legend>
        <div className="grid grid-cols-4 gap-3">
          {builtins.map((theme) => (
            <label key={theme.value} className="flex cursor-pointer flex-col items-center gap-2">
              <input
                type="radio"
                name={name}
                className="peer sr-only"
                value={theme.value}
                checked={value === theme.value}
                onChange={() => onChange(theme.value)}
              />
              <span aria-hidden className={`${swatch} ${theme.page} ${theme.text}`}>
                Aa
              </span>
              <span className={caption}>{theme.label}</span>
            </label>
          ))}
          {customThemes.map((theme) => {
            const ref = customThemeRef(theme.id)
            const colors: CSSProperties = { background: theme.background, color: theme.text }
            return (
              // The edit button sits beside the radio's label, not inside it: a click on it
              // must not choose the theme as well.
              <div key={theme.id} className="group relative">
                <label className="flex cursor-pointer flex-col items-center gap-2">
                  <input
                    type="radio"
                    name={name}
                    className="peer sr-only"
                    value={ref}
                    checked={value === ref}
                    onChange={() => onChange(ref)}
                  />
                  <span aria-hidden className={swatch} style={colors}>
                    Aa
                  </span>
                  <span className={caption}>{theme.name}</span>
                </label>
                {/* Shown on hover and keyboard focus, and always where nothing can hover. */}
                <button
                  type="button"
                  aria-label={`Edit ${theme.name}`}
                  data-tooltip="Edit"
                  className="absolute end-1 top-1 grid size-6 cursor-pointer place-items-center rounded-full bg-surface-raised text-fg opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  onClick={() => setEditing({ theme, existing: true })}
                >
                  <Pencil aria-hidden className="size-3" />
                </button>
              </div>
            )
          })}
          {/* Carrel keeps so many themes and no more; past that, one goes before another comes. */}
          <button
            type="button"
            className="flex cursor-pointer flex-col items-center gap-2 disabled:pointer-events-none disabled:opacity-50"
            disabled={full}
            onClick={() => setEditing({ theme: startingTheme(), existing: false })}
          >
            <span className="grid h-16 w-full place-items-center rounded-lg text-fg-muted ring-1 ring-border ring-inset hover:bg-surface-hover hover:text-fg">
              <Plus aria-hidden className="size-6" />
            </span>
            <span className="text-xs text-fg-secondary">
              {full ? 'Theme limit reached' : 'New theme'}
            </span>
          </button>
        </div>
      </fieldset>

      {editing && (
        <ThemeEditor
          open
          theme={editing.theme}
          existing={editing.existing}
          onSave={(theme) => {
            saveCustomTheme(theme)
            setEditing(null)
          }}
          onDelete={(id) => {
            deleteCustomTheme(id)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
