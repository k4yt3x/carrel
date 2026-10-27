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
import {
  defaultReadingSettings,
  limits,
  type ReadingSettings,
  type Theme,
  type Typeface,
} from '@/domain/settings'
import { Section, Segmented, Slider, Switch } from '@/ui/controls'
import type { SettingsScope } from '@/ui/reader/useReadingSettings'
import { Sheet } from '@/ui/Sheet'
import { ThemePicker } from '@/ui/ThemePicker'

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
}

const typefaceValue = (typeface: Typeface) =>
  typeof typeface === 'string' ? typeface : `font:${typeface.fontId}`

const parseTypeface = (value: string): Typeface =>
  value.startsWith('font:') ? { fontId: value.slice('font:'.length) } : (value as Typeface)

const px = (value: number) => `${value}px`
const decimal = (digits: number) => (value: number) => value.toFixed(digits)
const em = (value: number) => (value === 0 ? 'Normal' : `${value > 0 ? '+' : ''}${value}em`)

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
}: SettingsSheetProps) {
  const set = <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) =>
    onChange({ ...settings, [key]: value })
  const paginated = settings.flow === 'paginated'
  // A typeface whose font was removed falls back to the book's; the select shows that.
  const typeface =
    typeof settings.typeface === 'object' &&
    !fonts.some((font) => font.id === (settings.typeface as { fontId: string }).fontId)
      ? 'book'
      : typefaceValue(settings.typeface)

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
        />
        <p className="mt-2 text-xs leading-normal text-fg-muted">
          {scope === 'all'
            ? 'Books without settings of their own follow these.'
            : 'This book keeps its own settings. Switch back to use the shared ones again.'}
        </p>
      </div>

      <Section title="Theme">
        <ThemePicker value={theme} onChange={onThemeChange} />
      </Section>

      {!fixedLayout && (
        <Section title="Text">
          <div className="flex items-end gap-2">
            <label className="block min-w-0 flex-1">
              <span className="mb-2 block text-sm text-fg-secondary">Typeface</span>
              <select
                className="select w-full"
                value={typeface}
                onChange={(event) => set('typeface', parseTypeface(event.target.value))}
              >
                <option value="book">Book’s own</option>
                <option value="serif">Serif</option>
                <option value="sans">Sans-serif</option>
                {fonts.length > 0 && (
                  <optgroup label="Your fonts">
                    {fonts.map((font) => (
                      <option key={font.id} value={`font:${font.id}`}>
                        {font.family}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <button type="button" className="btn btn-ghost" onClick={onManageFonts}>
              {fonts.length > 0 ? 'Fonts…' : 'Add font…'}
            </button>
          </div>
          <Slider
            label="Size"
            {...limits.fontSize}
            value={settings.fontSize}
            format={px}
            onChange={(value) => set('fontSize', value)}
          />
          <Slider
            label="Line spacing"
            {...limits.lineHeight}
            value={settings.lineHeight}
            format={decimal(1)}
            onChange={(value) => set('lineHeight', Math.round(value * 10) / 10)}
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
            description="Breaks long words at line ends, for an even right edge."
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
              format={px}
              onChange={(value) => set('maxColumnWidth', value)}
            />
            <Slider
              label="Side margins"
              {...limits.sideMargin}
              value={settings.sideMargin}
              format={px}
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
                  description="The book and chapter titles above the text, your progress below."
                  checked={settings.runningHeads}
                  onChange={(value) => set('runningHeads', value)}
                />
              </>
            )}
          </>
        )}
        <Switch
          label="Tap the sides to turn pages"
          description="Otherwise any tap shows or hides the controls."
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
              format={em}
              onChange={(value) => set('letterSpacing', Math.round(value * 100) / 100)}
            />
            <Slider
              label="Word spacing"
              {...limits.wordSpacing}
              value={settings.wordSpacing}
              format={em}
              onChange={(value) => set('wordSpacing', Math.round(value * 100) / 100)}
            />
            <Switch
              label="Keep the book’s colours"
              description="In light themes, show text and backgrounds coloured as the book sets them. Dark themes always use their own."
              checked={settings.keepBookColors}
              onChange={(value) => set('keepBookColors', value)}
            />
            <label className="block">
              <span className="mb-2 block text-sm text-fg-secondary">Custom CSS</span>
              <textarea
                className="textarea h-32 w-full font-mono text-xs"
                spellCheck={false}
                placeholder="p { text-indent: 2em; }"
                value={settings.customCss}
                onChange={(event) => set('customCss', event.target.value)}
              />
              <span className="mt-1 block text-xs leading-normal text-fg-muted">
                Added to every page, after the book’s styles and these settings.
              </span>
            </label>
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
