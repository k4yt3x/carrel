/*
 * Design brief (refactoring-ui Workflow B), theme editor.
 *
 * Feature: make a theme of your own from three colours. Content, by rank:
 *   primary    the preview, a passage set in the theme, which is what the reader judges by
 *   secondary  the three colours, each with a picker and its hex value
 *   tertiary   the name; a warning, only when the text or links are too faint to read
 * Actions: Save is the primary action; Cancel is a ghost button; Delete is quiet, on the
 *   leading edge and away from Save, and only for a theme that already exists.
 */

import { useId, useState } from 'react'
import { type CustomTheme, contrastRatio, isHexColor, themeNameLimit } from '@/domain/themes'
import { Modal } from '@/ui/Modal'

interface ThemeEditorProps {
  open: boolean
  /** The theme being edited, or a new one's starting colours (with a fresh id). */
  theme: CustomTheme
  /** Whether the theme already exists, so it can be deleted. */
  existing: boolean
  onSave(theme: CustomTheme): void
  onDelete(id: string): void
  onClose(): void
}

/** Below this contrast (WCAG's minimum for body text), text is hard to read. */
const readableContrast = 4.5

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange(value: string): void
}) {
  const id = useId()
  const [typed, setTyped] = useState<string | null>(null)
  const apply = () => {
    if (typed === null) return
    const hex = typed.trim().startsWith('#') ? typed.trim() : `#${typed.trim()}`
    if (isHexColor(hex)) onChange(hex.toLowerCase())
    setTyped(null)
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm text-fg-secondary">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          className="size-8 shrink-0 cursor-pointer rounded-md border border-border-strong bg-transparent p-0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          type="text"
          aria-label={`${label}, hex value`}
          className="input input-sm min-w-0 flex-1 bg-surface-sunken font-mono text-xs"
          spellCheck={false}
          value={typed ?? value}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={apply}
          onKeyDown={(event) => {
            if (event.key === 'Enter') apply()
            if (event.key === 'Escape' && typed !== null) {
              // Escape abandons the typing, not the whole theme.
              event.preventDefault()
              event.stopPropagation()
              setTyped(null)
            }
          }}
        />
      </div>
    </div>
  )
}

export function ThemeEditor({
  open,
  theme,
  existing,
  onSave,
  onDelete,
  onClose,
}: ThemeEditorProps) {
  // The editor is mounted for each theme it edits, so the draft starts from that theme.
  const [draft, setDraft] = useState(theme)
  const nameId = useId()

  const faint = [draft.text, draft.link].some(
    (color) => contrastRatio(color, draft.background) < readableContrast,
  )
  const set = (key: keyof CustomTheme) => (value: string) => setDraft({ ...draft, [key]: value })

  return (
    <Modal open={open} title={existing ? 'Edit theme' : 'New theme'} onClose={onClose}>
      <div className="space-y-6">
        <div
          className="rounded-lg px-6 py-6 font-serif text-base leading-normal ring-1 ring-border"
          style={{ background: draft.background, color: draft.text }}
        >
          {/* Long enough to show the colours as a page of text, not a line. George Long's
              translation (1862), in the public domain. */}
          <p>
            Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful,
            arrogant, deceitful, envious, unsocial. All these things happen to them by reason of
            their ignorance of what is good and evil.
          </p>
          <p className="mt-3 text-sm">
            Marcus Aurelius, <span style={{ color: draft.link }}>Meditations</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <ColorField label="Page" value={draft.background} onChange={set('background')} />
          <ColorField label="Text" value={draft.text} onChange={set('text')} />
          <ColorField label="Links" value={draft.link} onChange={set('link')} />
        </div>

        {faint && (
          <p className="text-xs text-danger-fg" role="status">
            Text this close to the page colour is hard to read.
          </p>
        )}

        <label htmlFor={nameId} className="block">
          <span className="mb-2 block text-sm text-fg-secondary">Name</span>
          <input
            id={nameId}
            className="input w-full bg-surface-sunken"
            maxLength={themeNameLimit}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>

        <div className="flex items-center gap-3 pt-2">
          {existing && (
            <button
              type="button"
              className="btn btn-ghost -ms-4 text-danger-fg"
              onClick={() => onDelete(draft.id)}
            >
              Delete theme
            </button>
          )}
          <div className="ms-auto flex gap-3">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSave({ ...draft, name: draft.name.trim() || 'Untitled theme' })}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
