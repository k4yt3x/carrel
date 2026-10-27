/*
 * Design brief (refactoring-ui Workflow B), reading settings.
 *
 * Feature: make the page comfortable to read. Changes apply as they are made, so the sheet
 * leaves the page in view (no scrim) and every control previews itself on the page.
 * Content, by rank:
 *   primary    theme and text size, the two settings nearly everyone changes
 *   secondary  typeface, spacing, alignment; page layout
 *   tertiary   fine spacing, book colours, custom CSS: folded under "More", since few want them
 * Scope ("All books" / "This book") sits at the top because it decides where every change
 * below goes.
 * Tokens: section titles 12px semibold uppercase fg-muted; control labels 14px fg-secondary;
 * values 14px fg; 24px between controls, 32px before a section.
 */

import { ChevronRight, RotateCcw } from 'lucide-react'
import type { Font } from '@/domain/db'
import { defaultReadingSettings, limits, type ReadingSettings, type Theme } from '@/domain/settings'
import { Section, Segmented, Slider, Switch } from '@/ui/controls'
import { TypefacePicker } from '@/ui/reader/TypefacePicker'
import type { SettingsScope } from '@/ui/reader/useReadingSettings'
import { Sheet } from '@/ui/Sheet'
import { ThemePicker } from '@/ui/ThemePicker'
import { useDraft } from '@/ui/useDraft'

interface SettingsSheetProps {
  open: boolean
  onClose(): void
  settings: ReadingSettings
  onChange(settings: ReadingSettings): void
  scope: SettingsScope
  onScopeChange(scope: SettingsScope): void
  theme: Theme
  onThemeChange(theme: Theme): void
  /** Fixed-layout books (PDF, comics) have no text to set, only pages to fit. */
  fixedLayout: boolean
  fonts: Pick<Font, 'id' | 'family'>[]
  onManageFonts(): void
  /** Where the text sits across the window; absent where it can't be moved. */
  textOffset?: {
    /** Pixels right of the window's centre, negative to the left, as far as the window allows. */
    value: number
    /** The offsets that put the text against either edge; null when it fills the window. */
    range: { min: number; max: number } | null
    onChange(offset: number): void
    /** Told while the slider is held, to mark the middle of the text. */
    onHoldChange(holding: boolean): void
  }
}

// What the sliders say to a screen reader.
const pixels = (value: number) => `${Math.round(value)} pixels`
const offset = (value: number) =>
  value === 0 ? 'Centred' : `${Math.abs(value)} pixels ${value < 0 ? 'left' : 'right'}`
const em = (value: number) =>
  value === 0 ? 'Normal' : `${value > 0 ? 'plus' : 'minus'} ${Math.abs(value).toFixed(2)} em`

/**
 * The reader's own stylesheet. Typing restyles the book once the typing pauses, rather than on
 * every keystroke, each of which would lay the book out again.
 */
function CustomCss({ value, onChange }: { value: string; onChange(css: string): void }) {
  const draft = useDraft(value, onChange, 600)
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-fg-secondary">Custom CSS</span>
      <textarea
        className="textarea h-32 w-full font-mono text-xs"
        spellCheck={false}
        placeholder="p { text-indent: 2em; }"
        value={draft.value}
        onChange={(event) => draft.change(event.target.value)}
        onBlur={draft.commit}
      />
    </label>
  )
}

export function SettingsSheet({
  open,
  onClose,
  settings,
  onChange,
  scope,
  onScopeChange,
  theme,
  onThemeChange,
  fixedLayout,
  fonts,
  onManageFonts,
  textOffset,
}: SettingsSheetProps) {
  const set = <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) =>
    onChange({ ...settings, [key]: value })
  const paginated = settings.flow === 'paginated'

  return (
    <Sheet open={open} title="Reading settings" side="end" seeThrough onClose={onClose}>
      <div className="px-6">
        <Segmented
          legend="Apply changes to"
          value={scope}
          options={[
            { value: 'all', label: 'All books' },
            { value: 'book', label: 'This book' },
          ]}
          onChange={onScopeChange}
          info="“This book” gives this book settings of its own; the others keep the shared ones."
        />
      </div>

      <Section title="Theme">
        <ThemePicker value={theme} onChange={onThemeChange} />
      </Section>

      {!fixedLayout && (
        <Section title="Text">
          <TypefacePicker
            value={settings.typeface}
            fonts={fonts}
            onChange={(value) => set('typeface', value)}
            onManageFonts={onManageFonts}
          />
          <Slider
            label="Size"
            {...limits.fontSize}
            value={settings.fontSize}
            unit="px"
            digits={0}
            format={pixels}
            onChange={(value) => set('fontSize', value)}
          />
          <Slider
            label="Line spacing"
            {...limits.lineHeight}
            value={settings.lineHeight}
            digits={2}
            format={(value) => `${value.toFixed(2)} times the text size`}
            onChange={(value) => set('lineHeight', Math.round(value * 100) / 100)}
          />
          <Segmented
            legend="Alignment"
            value={settings.textAlign}
            options={[
              { value: 'book', label: 'Book’s' },
              { value: 'start', label: 'Ragged' },
              { value: 'justify', label: 'Justified' },
            ]}
            onChange={(value) => set('textAlign', value)}
          />
          <Segmented
            legend="Paragraphs"
            value={settings.paragraphs}
            options={[
              { value: 'book', label: 'Book’s' },
              { value: 'indented', label: 'Indented' },
              { value: 'spaced', label: 'Spaced' },
            ]}
            onChange={(value) => set('paragraphs', value)}
          />
          <Switch
            label="Hyphenation"
            checked={settings.hyphenate}
            onChange={(value) => set('hyphenate', value)}
          />
        </Section>
      )}

      <Section title="Layout">
        <Segmented
          legend="Reading mode"
          value={settings.flow}
          options={[
            { value: 'paginated', label: 'Pages' },
            { value: 'scrolled', label: 'Scroll' },
          ]}
          onChange={(value) => set('flow', value)}
        />
        {fixedLayout ? (
          <>
            <Segmented
              legend="Fit"
              value={settings.pageFit}
              options={[
                { value: 'page', label: 'Whole page' },
                { value: 'width', label: 'Page width' },
              ]}
              onChange={(value) => set('pageFit', value)}
            />
            <Segmented
              legend="Facing pages"
              value={settings.spreads}
              options={[
                { value: 'auto', label: 'Side by side' },
                { value: 'none', label: 'One at a time' },
              ]}
              onChange={(value) => set('spreads', value)}
            />
          </>
        ) : (
          <>
            {paginated && (
              <Segmented
                legend="Columns"
                value={settings.columns}
                options={[
                  { value: 'auto', label: 'Two when wide' },
                  { value: 'one', label: 'One' },
                ]}
                onChange={(value) => set('columns', value)}
              />
            )}
            <Slider
              label="Line length"
              {...limits.maxColumnWidth}
              value={settings.maxColumnWidth}
              unit="px"
              digits={0}
              format={pixels}
              onChange={(value) => set('maxColumnWidth', value)}
            />
            <Slider
              label="Side margins"
              {...limits.sideMargin}
              value={settings.sideMargin}
              unit="px"
              digits={0}
              format={pixels}
              onChange={(value) => set('sideMargin', value)}
            />
            {paginated && (
              <>
                <Segmented
                  legend="Page turn"
                  value={settings.pageTurn}
                  options={[
                    { value: 'slide', label: 'Slide' },
                    { value: 'curl', label: 'Curl' },
                    { value: 'none', label: 'Instant' },
                  ]}
                  onChange={(value) => set('pageTurn', value)}
                />
                <Switch
                  label="Running heads"
                  info="The book and chapter titles above the text."
                  checked={settings.runningHeads}
                  onChange={(value) => set('runningHeads', value)}
                />
              </>
            )}
          </>
        )}
        <Segmented
          legend="Progress"
          value={settings.progress}
          options={[
            { value: 'percent', label: 'Percent' },
            { value: 'page', label: 'Page' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(value) => set('progress', value)}
          info={
            fixedLayout
              ? 'Shown in the corner of the page.'
              : 'Shown in the corner of the page. Pages here are fixed lengths of text, so their numbers stay the same at any text size.'
          }
        />
        {textOffset && (
          <Slider
            label="Position"
            info="Moves the text left or right of the window’s centre, for a window that isn’t centred on the screen, such as a browser with vertical tabs."
            min={textOffset.range?.min ?? 0}
            max={textOffset.range?.max ?? 0}
            step={1}
            detent={0}
            live
            disabled={!textOffset.range}
            value={textOffset.value}
            unit="px"
            digits={0}
            format={offset}
            onHoldChange={textOffset.onHoldChange}
            onChange={textOffset.onChange}
          />
        )}
        <Switch
          label="Tap the sides to turn pages"
          checked={settings.tapToTurn}
          onChange={(value) => set('tapToTurn', value)}
        />
      </Section>

      {!fixedLayout && (
        <details className="group mt-8 border-t border-border">
          <summary className="flex h-12 cursor-pointer items-center gap-2 px-6 text-sm text-fg-secondary hover:text-fg">
            <ChevronRight
              aria-hidden
              className="size-4 text-fg-muted transition-transform group-open:rotate-90"
            />
            More settings
          </summary>
          <div className="space-y-6 px-6 pt-2">
            <Slider
              label="Letter spacing"
              {...limits.letterSpacing}
              value={settings.letterSpacing}
              unit="em"
              digits={2}
              format={em}
              onChange={(value) => set('letterSpacing', Math.round(value * 100) / 100)}
            />
            <Slider
              label="Word spacing"
              {...limits.wordSpacing}
              value={settings.wordSpacing}
              unit="em"
              digits={2}
              format={em}
              onChange={(value) => set('wordSpacing', Math.round(value * 100) / 100)}
            />
            <Switch
              label="Keep the book’s colours"
              info="Text and background colours the book sets are kept in light themes. Dark themes always use their own."
              checked={settings.keepBookColors}
              onChange={(value) => set('keepBookColors', value)}
            />
            <CustomCss value={settings.customCss} onChange={(css) => set('customCss', css)} />
          </div>
        </details>
      )}

      <div className="px-6 pt-8">
        <button
          type="button"
          className="btn btn-ghost -ms-4"
          onClick={() => onChange(defaultReadingSettings)}
        >
          <RotateCcw aria-hidden className="size-4" />
          Reset to defaults
        </button>
      </div>
    </Sheet>
  )
}
