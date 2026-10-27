import { useId } from 'react'
import type { Theme } from '@/domain/settings'

// Each swatch is painted with the theme's own page and text primitives, which stay the same
// whichever theme is active, so the four can be compared side by side.
const swatches: { value: Theme; label: string; page: string; text: string }[] = [
  {
    value: 'system',
    label: 'System',
    page: 'bg-[linear-gradient(135deg,var(--color-neutral-50)_50%,var(--color-neutral-950)_50%)]',
    text: 'text-neutral-500',
  },
  { value: 'light', label: 'Light', page: 'bg-neutral-50', text: 'text-neutral-900' },
  { value: 'sepia', label: 'Sepia', page: 'bg-sepia-100', text: 'text-sepia-900' },
  { value: 'dark', label: 'Dark', page: 'bg-neutral-950', text: 'text-neutral-200' },
]

/** The app's theme, which book pages follow too. */
export function ThemePicker({ value, onChange }: { value: Theme; onChange(theme: Theme): void }) {
  const name = useId()
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-4 gap-3">
        {swatches.map((swatch) => (
          <label key={swatch.value} className="flex cursor-pointer flex-col items-center gap-2">
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              value={swatch.value}
              checked={value === swatch.value}
              onChange={() => onChange(swatch.value)}
            />
            <span
              aria-hidden
              className={`grid h-16 w-full place-items-center rounded-lg font-serif text-lg ring-1 ring-border peer-checked:ring-2 peer-checked:ring-action peer-checked:ring-offset-2 peer-checked:ring-offset-surface-raised peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus ${swatch.page} ${swatch.text}`}
            >
              Aa
            </span>
            <span className="text-xs text-fg-secondary peer-checked:font-semibold peer-checked:text-fg">
              {swatch.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
