import { describe, expect, it } from 'vitest'
import { sliderValueAt } from '@/ui/sliderValue'

// A 216-pixel slider from x = 100 with a 16-pixel thumb: its centre runs from 108 to 308.
const slider = { left: 100, width: 216, thumb: 16, min: 0, max: 200, step: 1 }

describe('sliderValueAt', () => {
  it('follows the thumb’s centre, not the slider’s ends', () => {
    expect(sliderValueAt({ ...slider, x: 108 })).toBe(0)
    expect(sliderValueAt({ ...slider, x: 208 })).toBe(100)
    expect(sliderValueAt({ ...slider, x: 308 })).toBe(200)
  })

  it('keeps to the range wherever the pointer goes', () => {
    expect(sliderValueAt({ ...slider, x: -500 })).toBe(0)
    expect(sliderValueAt({ ...slider, x: 5000 })).toBe(200)
  })

  it('lands on the nearest step, without floating-point error', () => {
    const spacing = { ...slider, min: 1, max: 2.4, step: 0.05 }
    // Three-tenths of the way: 1.42, the nearest step 1.4.
    expect(sliderValueAt({ ...spacing, x: 108 + 60 })).toBe(1.4)
    expect(sliderValueAt({ ...slider, min: 400, max: 1200, step: 10, x: 111 })).toBe(410)
  })

  it('gives negative values on a slider that runs both ways', () => {
    expect(sliderValueAt({ ...slider, min: -100, max: 100, x: 158 })).toBe(-50)
  })
})
