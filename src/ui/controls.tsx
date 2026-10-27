/**
 * Form controls for settings: a segmented choice, a slider with its value, and a switch.
 * Each is a native control underneath (radio buttons, a range input, a checkbox), so the
 * keyboard, screen readers and forms work as they do everywhere else.
 */

import { type ReactNode, useId, useRef, useState } from 'react'
import { InfoTip } from '@/ui/InfoTip'
import { sliderValueAt } from '@/ui/sliderValue'
import { useDraft } from '@/ui/useDraft'

interface Option<T extends string> {
  value: T
  label: ReactNode
  /** Spoken name, when the visible label is an icon or a sample. */
  name?: string
}

interface SegmentedProps<T extends string> {
  legend: string
  /** What the legend can't say, behind an (i) beside it. */
  info?: ReactNode
  value: T
  options: readonly Option<T>[]
  onChange(value: T): void
}

/** One choice out of two to four, shown side by side. */
export function Segmented<T extends string>({
  legend,
  info,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  // Radio buttons outside a form group by name across the whole document.
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1 text-sm text-fg-secondary">
        {legend}
        {info && <InfoTip label={`About ${legend.toLowerCase()}`}>{info}</InfoTip>}
      </legend>
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
  /** Shown after the exact value, such as "px"; none for a plain number. */
  unit?: string
  /** Decimal places the exact value is shown with. */
  digits: number
  /** How the value reads to a screen reader, such as "18 pixels" or "Normal". */
  format(value: number): string
  /** What the label can't say, behind an (i) beside it. */
  info?: ReactNode
  /**
   * A value marked on the track that a drag settles on when it comes near, such as the centre
   * of a slider that moves something either way, so returning to it takes no precision.
   */
  detent?: number
  /** The setting is cheap to apply, so it follows every step of a drag rather than the pauses. */
  live?: boolean
  /** Told when the pointer takes hold of the slider and when it lets go. */
  onHoldChange?(holding: boolean): void
  /** No value to choose: there is no room for one. */
  disabled?: boolean
  onChange(value: number): void
}

/** How long a drag has to pause before the setting follows it. */
const settleMs = 150

/**
 * A number set with a slider, for quick changes, or by typing it, for exact ones. Typed values
 * can fall between the slider's steps; they are kept within its range.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  digits,
  format,
  info,
  detent,
  live,
  onHoldChange,
  disabled,
  onChange,
}: SliderProps) {
  const draft = useDraft(value, onChange, live ? 0 : settleMs)
  const rangeId = useId()
  const dragging = useRef(false)
  const followed = useRef<number | null>(null)
  const pull = Math.max(step * 3, (max - min) * 0.02)
  const detentAt =
    detent !== undefined && detent >= min && detent <= max && max > min
      ? (detent - min) / (max - min)
      : null
  const shown = draft.value.toFixed(digits)
  // The text being typed into the exact value, until it is applied or abandoned.
  const [typed, setTyped] = useState<string | null>(null)

  const applyTyped = () => {
    if (typed === null) return
    setTyped(null)
    const number = Number.parseFloat(typed.replace(',', '.'))
    if (!Number.isFinite(number)) return
    draft.change(Math.min(max, Math.max(min, number)))
    draft.commit()
  }

  /** Moves the value to the pointer, settling on the detent when it comes near. */
  const follow = (input: HTMLInputElement, x: number) => {
    const box = input.getBoundingClientRect()
    // The thumb is as wide as the slider is tall (range-xs).
    const next = sliderValueAt({
      x,
      left: box.left,
      width: box.width,
      thumb: box.height,
      min,
      max,
      step,
    })
    const settled = detent !== undefined && Math.abs(next - detent) <= pull ? detent : next
    // Pointer moves come faster than renders; this, not the rendered value, is the latest.
    if (settled === followed.current) return
    followed.current = settled
    draft.change(settled)
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1">
          <label htmlFor={rangeId} className="text-fg-secondary">
            {label}
          </label>
          {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
        </span>
        <span className="flex items-baseline gap-1 text-fg tabular-nums">
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            aria-label={`${label}, exact value${unit ? ` in ${unit}` : ''}`}
            className="w-16 rounded-sm bg-transparent px-1 text-end hover:bg-surface-hover focus:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus"
            value={typed ?? shown}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={applyTyped}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyTyped()
              if (event.key === 'Escape' && typed !== null) {
                // Escape abandons the typing, not the whole sheet.
                event.preventDefault()
                event.stopPropagation()
                setTyped(null)
              }
            }}
          />
          {unit && <span className="text-fg-muted">{unit}</span>}
        </span>
      </div>
      <div className="relative flex">
        {detentAt !== null && (
          // Under the slider, which is positioned after it, so the thumb covers the mark. The thumb
          // is 1rem wide (range-xs), so its centre travels from 0.5rem to 100% − 0.5rem.
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-fg-muted"
            style={{ left: `calc(0.5rem + (100% - 1rem) * ${detentAt})` }}
          />
        )}
        <input
          id={rangeId}
          type="range"
          // A slider with a detent moves something either way from it; a fill from the left
          // end would read as an amount.
          className={`range range-xs range-primary relative w-full touch-pan-y ${detentAt === null ? '' : '[--range-fill:0]'}`}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={draft.value}
          aria-valuetext={format(draft.value)}
          // A drag is followed here rather than left to the browser, with the pointer captured:
          // the book's pages are other documents (iframes), and a pointer passing over one
          // would otherwise take its movements there and leave the slider where it was.
          // Vertical swipes still scroll the sheet on a touch screen.
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return
            event.preventDefault()
            const input = event.currentTarget
            input.focus()
            input.setPointerCapture(event.pointerId)
            dragging.current = true
            followed.current = draft.value
            onHoldChange?.(true)
            follow(input, event.clientX)
          }}
          onPointerMove={(event) => {
            if (dragging.current) follow(event.currentTarget, event.clientX)
          }}
          // Letting go (or a swipe turning into a scroll) releases the pointer, and applies the
          // value without waiting.
          onLostPointerCapture={() => {
            if (!dragging.current) return
            dragging.current = false
            onHoldChange?.(false)
            draft.commit()
          }}
          // The keyboard, and anything else the browser does natively.
          onChange={(event) => draft.change(Number(event.target.value))}
          onKeyUp={draft.commit}
          onBlur={draft.commit}
        />
      </div>
    </div>
  )
}

interface SwitchProps {
  label: string
  /** What the label can't say, behind an (i) beside it. */
  info?: ReactNode
  checked: boolean
  onChange(checked: boolean): void
}

export function Switch({ label, info, checked, onChange }: SwitchProps) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={id} className="cursor-pointer text-sm text-fg">
          {label}
        </label>
        {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="toggle toggle-sm toggle-primary shrink-0"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
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
