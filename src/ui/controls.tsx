/**
 * Form controls for settings: a segmented choice, a slider with its value, and a switch.
 * Each is a native control underneath (radio buttons, a range input, a checkbox), so the
 * keyboard, screen readers and forms work as they do everywhere else.
 */

import { type ReactNode, useId } from 'react'

interface Option<T extends string> {
  value: T
  label: ReactNode
  /** Spoken name, when the visible label is an icon or a sample. */
  name?: string
}

interface SegmentedProps<T extends string> {
  legend: string
  value: T
  options: readonly Option<T>[]
  onChange(value: T): void
}

/** One choice out of two to four, shown side by side. */
export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  // Radio buttons outside a form group by name across the whole document.
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-fg-secondary">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-md bg-surface-track p-1">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              className="peer sr-only"
              name={name}
              value={option.value}
              checked={option.value === value}
              aria-label={option.name}
              onChange={() => onChange(option.value)}
            />
            <span className="flex h-8 cursor-pointer items-center justify-center rounded-sm px-2 text-sm text-fg-secondary hover:text-fg peer-checked:bg-surface-selected peer-checked:font-semibold peer-checked:text-fg peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** How the value reads, both on screen and to a screen reader. */
  format(value: number): string
  onChange(value: number): void
}

export function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  const text = format(value)
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between text-sm">
        <span className="text-fg-secondary">{label}</span>
        <span className="text-fg tabular-nums">{text}</span>
      </span>
      <input
        type="range"
        className="range range-xs range-primary w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={text}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

interface SwitchProps {
  label: string
  description?: string
  checked: boolean
  onChange(checked: boolean): void
}

export function Switch({ label, description, checked, onChange }: SwitchProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description && (
          <span className="mt-1 block text-xs leading-normal text-fg-muted">{description}</span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="toggle toggle-sm toggle-primary mt-1 shrink-0"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

/** A titled group of settings. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-6 px-6 pt-8">
      <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}
