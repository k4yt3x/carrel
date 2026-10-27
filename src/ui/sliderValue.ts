/**
 * The value of a slider at a point across it: where the thumb's centre would be, on the
 * nearest step. The thumb's centre runs from half its width in from one end to half its width
 * in from the other, as on a native range input.
 */
export function sliderValueAt({
  x,
  left,
  width,
  thumb,
  min,
  max,
  step,
}: {
  /** The pointer's distance from the window's left edge. */
  x: number
  /** The slider's left edge and width, as the window lays it out. */
  left: number
  width: number
  /** The thumb's width. */
  thumb: number
  min: number
  max: number
  step: number
}): number {
  if (max <= min || width <= thumb) return min
  const fraction = Math.min(1, Math.max(0, (x - left - thumb / 2) / (width - thumb)))
  const value = Math.min(max, min + Math.round((fraction * (max - min)) / step) * step)
  // Steps such as 0.05 add up with floating-point error; keep the step's own decimals.
  const decimals = String(step).split('.')[1]?.length ?? 0
  return Number(value.toFixed(decimals))
}
