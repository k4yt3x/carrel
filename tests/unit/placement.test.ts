import { describe, expect, it } from 'vitest'
import { offsetRange, placementGap, placeText } from '@/ui/reader/placement'

// A 720-pixel column centred in a 1600-pixel window: 440 pixels either side.
const text = { left: 440, width: 720 }
const viewport = 1600

describe('offsetRange', () => {
  it('reaches either edge of the window, less the gap', () => {
    expect(offsetRange(text, viewport)).toEqual({
      min: placementGap - 440,
      max: 440 - placementGap,
    })
  })

  it('always reaches back to where the layout put the text', () => {
    // A single page on the right of a spread, against the window's right edge.
    expect(offsetRange({ left: 550, width: 550 }, 1100)).toEqual({
      min: placementGap - 550,
      max: 0,
    })
  })

  it('has no range when the text fills the window', () => {
    expect(offsetRange({ left: 24, width: 1552 }, viewport)).toBeNull()
  })
})

describe('placeText', () => {
  it('follows the offset', () => {
    expect(placeText({ text, viewport, offset: -200, sidebar: 0 })).toEqual({
      shift: -200,
      clear: true,
    })
  })

  it('keeps the text inside the window whatever the offset', () => {
    expect(placeText({ text, viewport, offset: -4000, sidebar: 0 }).shift).toBe(placementGap - 440)
    expect(placeText({ text, viewport, offset: 4000, sidebar: 0 }).shift).toBe(440 - placementGap)
  })

  it('leaves the text where it is when the sidebar is clear of it', () => {
    expect(placeText({ text, viewport, offset: 0, sidebar: 320 })).toEqual({
      shift: 0,
      clear: true,
    })
  })

  it('moves the text only as far as the sidebar needs', () => {
    expect(placeText({ text, viewport, offset: -300, sidebar: 320 })).toEqual({
      shift: 320 + placementGap - 440,
      clear: true,
    })
  })

  it('leaves the text in place when there is no room beside the sidebar', () => {
    const narrow = { left: 140, width: 720 }
    expect(placeText({ text: narrow, viewport: 1000, offset: 50, sidebar: 320 })).toEqual({
      shift: 50,
      clear: false,
    })
  })

  it('does not move text that fills the window', () => {
    expect(
      placeText({ text: { left: 0, width: viewport }, viewport, offset: 300, sidebar: 0 }),
    ).toEqual({ shift: 0, clear: true })
  })
})
