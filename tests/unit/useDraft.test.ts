// @vitest-environment jsdom
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraft } from '@/ui/useDraft'

// React reports updates outside act() unless told it runs under a test.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

type Draft = ReturnType<typeof useDraft<number>>

interface Handles {
  draft?: Draft
  setValue?: (value: number) => void
}

/** The hook against a setting held by a parent, as a control uses it. */
function Host({
  onChange,
  initial,
  handles,
}: {
  onChange: (value: number) => void
  initial: number
  handles: Handles
}) {
  const [value, setValue] = useState(initial)
  handles.setValue = setValue
  handles.draft = useDraft(value, onChange, 150)
  return null
}

function harness(onChange: (value: number) => void, initial = 10) {
  const handles: Handles = {}
  const root: Root = createRoot(document.createElement('div'))
  act(() => root.render(createElement(Host, { onChange, initial, handles })))
  return {
    draft: () => handles.draft as Draft,
    setValue: (value: number) => act(() => handles.setValue?.(value)),
    root,
  }
}

describe('useDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('follows a drag at once and applies it once the movement pauses', () => {
    const onChange = vi.fn()
    const { draft } = harness(onChange)
    act(() => {
      draft().change(11)
      draft().change(12)
      draft().change(13)
    })
    expect(draft().value).toBe(13)
    expect(onChange).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(13)
  })

  it('applies at once when the drag ends', () => {
    const onChange = vi.fn()
    const { draft } = harness(onChange)
    act(() => draft().change(20))
    act(() => draft().commit())
    expect(onChange).toHaveBeenCalledWith(20)
  })

  it('keeps showing the edit until a slow setting comes back with it', () => {
    const onChange = vi.fn()
    const { draft, setValue } = harness(onChange)
    act(() => draft().change(20))
    act(() => draft().commit())
    // The setting hasn't changed yet (a write to IndexedDB is under way).
    expect(draft().value).toBe(20)
    setValue(20)
    expect(draft().value).toBe(20)
    // A later change made elsewhere, such as Reset, shows.
    setValue(10)
    expect(draft().value).toBe(10)
  })

  it('doesn’t let an earlier value coming back undo an edit still in progress', () => {
    const { draft, setValue } = harness(vi.fn())
    act(() => draft().change(20))
    setValue(15)
    expect(draft().value).toBe(20)
  })

  it('keeps an edit still waiting when the control goes away', () => {
    const onChange = vi.fn()
    const { draft, root } = harness(onChange)
    act(() => draft().change(30))
    act(() => root.unmount())
    expect(onChange).toHaveBeenCalledWith(30)
  })
})
