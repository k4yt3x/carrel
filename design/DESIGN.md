# Carrel design system

Carrel is a place to read. The interface is quiet so that the book is the loudest thing on
any screen. Everything below follows from that.

The system was built with the method in _Refactoring UI_ (via the refactoring-ui skill). The
source of truth is `design-tokens.json`. Run `pnpm design:emit` after editing it; that
regenerates `src/styles/theme.css` (the Tailwind theme the app uses) and `tokens.css` (the
same tokens as plain custom properties). `preview.html` shows the scales.

## Personality

| Axis              | Choice        | What it produced                                                                                                                                                                                  |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serious ↔ playful | Serious, calm | Small radii (2, 4 and 8 px); no decoration that isn't doing a job                                                                                                                                 |
| Classic ↔ modern  | Classic       | An old-style serif (Iowan Old Style, Palatino and kin) for the books' own text, the theme swatches and stand-in covers; the system sans for the interface, wordmark included; quiet neutral greys |
| Dense ↔ spacious  | Spacious      | Generous gaps on the shelf (48 px between rows) and around the empty state                                                                                                                        |

The interface has no accent hue. The primary action, the current place in a list and focus
are drawn in the theme's own greys at their strongest contrast, so the book covers, and the icon
beside the wordmark, are the only colour on screen. Hue is kept for danger and warning, where
it carries meaning.

## Colour

Components use **semantic tokens only**. They never name a primitive (`bg-neutral-900` is
wrong in a component; `bg-action` is right). The semantic layer is what each theme remaps, so a component
written against it is correct in every theme for free.

There are two palettes: light (the base declaration) and dark (`semantic-dark` in the JSON).
The reader picks Auto (the system's scheme), Light or Dark, or a theme of their own; `emit.ts` keys the
remaps on `data-theme` on the root element, and with no attribute the page follows the
system's colour scheme. `public/theme-boot.js` sets the attribute before the first paint, so a
pinned theme never flashes the system's. The one exception to semantic-only is the theme
picker, whose swatches show each palette's own primitives side by side.

Readers can also make themes of their own from three colours: page, text and links. The other
tokens are derived from those in CSS, by mixing them in oklab (`semantic-custom-light` and
`semantic-custom-dark` in the JSON; `data-theme="custom"` with `data-scheme` set from the page
colour's luminance). Their contrast can't be checked ahead of time, so the theme editor warns,
as the colours are picked, when the text or the links fall below 4.5:1 against the page.

| Token                                 | Use                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `surface`                             | The page.                                                                       |
| `surface-raised`                      | Anything that floats above the page: dialogs, menus, toasts, the reader's bars. |
| `surface-sunken`                      | Inputs and other wells.                                                         |
| `surface-hover`                       | Hover and pressed rows in lists and menus; the fill of a default button.        |
| `surface-track`, `surface-selected`   | A segmented control's track and its selected segment.                           |
| `fg`, `fg-secondary`, `fg-muted`      | The three text tiers. See Typography.                                           |
| `border`, `border-strong`             | Dividers and field edges. Prefer space or a background change first.            |
| `action`, `action-hover`, `on-action` | The primary button and its text; the mark and ring of a chosen book.            |
| `action-subtle`, `action-fg`          | The current or chosen item in a list; links and accents set as text.            |
| `danger`, `danger-hover`, `on-danger` | Only the confirming button of a destructive dialog.                             |
| `danger-subtle`, `danger-fg`          | Error text and error notices (dark text on a light tint).                       |
| `warning-subtle`, `warning-fg`        | Warning notices.                                                                |
| `cover`, `on-cover`, `on-cover-muted` | The cloth binding drawn for a book without a cover.                             |
| `focus`                               | Focus rings.                                                                    |
| `scrim`                               | Behind modal dialogs and the drop target, at 40% opacity.                       |

Every text pair the interface produces is listed under `pairs` in `design-tokens.json` and
checked against WCAG (4.5:1 for normal text) with the skill's `check_contrast.py`. All pass in
every theme. Add the pair there when a new combination appears.

**Shades are fixed.** Adjusting an existing stop is fine; adding stops is how a palette falls
apart. The ramps were generated with `generate_palette.py`; the commands are recorded in the
JSON's `$meta.generated`.

## Typography

- **Type scale:** 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72 px. These are the only sizes.
  Interface text is 14 px; secondary details 12 px; dialog titles 18 px; the empty-state
  heading 20 px; the wordmark 24 px. On touch screens form fields are 16 px, since iOS zooms
  the page into a smaller field that takes the focus.
- **Typefaces:** the interface is set in each platform's own interface font (San Francisco,
  Segoe UI, Noto Sans), named one by one rather than through `system-ui`. `system-ui` is the
  font the desktop is set to, which on Linux can be anything, a monospace face included, and
  on Windows with an East Asian display language is that locale's UI font. Where none of the
  named fonts exists, the browser's own sans-serif takes over. The theme swatches and the
  cloth covers use the serif stack; the wordmark, set beside the app's mark, is sans.
- **Two weights:** 400 for reading and 600 for emphasis. Nothing lighter than 400.
- **Three text colours:** `fg` for what matters, `fg-secondary` for supporting text, `fg-muted`
  for metadata. A fourth is never needed; if it seems to be, the hierarchy is wrong.
- **Line height** is chosen per context: 1.25 (`leading-tight`) for titles that wrap, 1.5 for
  interface text, 1.6 for book text.
- **Measure:** book pages are capped at 640 px a column, about 65–75 characters at 18 px.

## Space and size

The spacing scale is 0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 640, 768 px
(`p-1` is 4 px, `p-6` 24 px, `p-12` 48 px and so on). Tailwind's own scale is switched off, so a
value outside this list has to be written as an arbitrary value, where review sees it.

**Space around a group is always larger than space inside it.** A cover is 12 px from its
title and 48 px from the row below; a dialog's title is 12 px from its text and 32 px from its
buttons.

**The system's edges come first.** On a phone, the notch or Dynamic Island, the status bar and
the home indicator take the edges of the screen (`env(safe-area-inset-*)`). Content and
controls keep inside them, with their usual margins on top; the backgrounds of bars, sheets
and the docked contents run on into them.

## Depth

Five elevations, light from above:

| Utility      | Use                                                |
| ------------ | -------------------------------------------------- |
| `shadow-sm`  | A selected segment; the theme picker's edit button |
| `shadow-md`  | Book covers; the reader's bars                     |
| `shadow-lg`  | Menus; a cover under the pointer; error banners    |
| `shadow-xl`  | Toasts                                             |
| `shadow-2xl` | Dialogs and sheets                                 |

In dark mode shadows barely register, so elevation is carried by `surface-raised` being
lighter than `surface`.

Stacking order follows the same ranking: page 0, reader bars 20, drop target and the reader's
error banner 30, toasts 60. Dialogs and menus use the browser's top layer.

## Radius and borders

- `rounded-sm` (2 px): book covers, which are nearly square-cornered objects.
- `rounded-md` (4 px): buttons, fields, menu rows.
- `rounded-lg` (8 px): dialogs, menus, toasts.
- Borders are 1 px. A hairline on covers (`outline-fg/10`) keeps a white cover from melting
  into the page.

## Actions

One primary action per screen, filled with `action`: "Add books" in the library. Secondary
actions are default buttons (filled with `surface-hover`) or sunken fields (search, sort).
Tertiary actions are ghost buttons and icons (the per-book menu, the reader's controls). A
destructive action is tertiary where it is offered (red text in a menu) and only becomes loud
in the dialog that confirms it. Settings have no single primary action, so every button in
them is a default button; the one exception is the Restore button inside the confirmation
that appears once a backup has been checked.

Settings controls come from `src/ui/controls.tsx`: `Segmented` for two to four choices,
`Slider` for a number with its value shown, `Switch` for on and off, each a native control
underneath, with a label and, where it needs one, an (i).

## Words

Labels name what a control does, in plain words; most need nothing else. The rare fact a label
can't carry (what a setting leaves alone, what a backup holds) goes behind an (i) beside it
(`src/ui/InfoTip.tsx`), shown on hover, focus or tap, not in a line of small print under the
control. A control drawn as an icon alone (the reader's bars, a dialog's close button) names
itself in a tip when the pointer rests on it or Tab reaches it, with its keyboard shortcut if
it has one (`src/ui/Tooltips.tsx`, opted into with `data-tooltip`). Status and error messages
say what happened, and what to do only when there is one thing to do. Warnings appear only when something is wrong, not as a running commentary when
all is well.

## Motion and focus

- Transitions are 150–200 ms, ease-out. `prefers-reduced-motion` turns them off, and turns off
  the page-turn animation.
- Every focusable element shows a 2 px `focus` ring when focused from the keyboard. Never
  remove it without a replacement.
- Hit targets are 40 px in the library's toolbar and 36 px on the reader's bars. Small helpers
  beside a larger target (an (i), a fold toggle in the contents, a theme's edit button) are
  24 px, never smaller.

## The reader

The book page takes its colours from the same semantic tokens (`surface`, `fg`, `action-fg`),
so it always matches the interface around it, and the page background is always the theme's.
In light themes a book keeps its own text colours unless the reader turns that off; in the dark
theme they are overridden, because books set for paper are often black on black otherwise.

Panels open from the side on wide screens and rise from the bottom on narrow ones
(`src/ui/Sheet.tsx`). Reading settings leave the page undimmed, since their effect is the
point; search dims it. On a wide screen the contents dock at the leading edge instead, with a
border rather than a shadow, and stay open while the reader reads; on a narrow one they are a
sheet like the others. Footnotes open in a card over the page rather than jumping to the note.

The text is centred on the window, never on the space a panel leaves, so panels opening and
closing don't move it (`src/ui/reader/placement.ts`). The reader can offset it to either side,
for a window that isn't centred on the screen; the docked contents push it aside only when they
would otherwise cover it.

In paged layout, running heads (book title on the left page, chapter on the right) sit in the
top margin in 12 px `fg-muted`, as in a printed book. The progress, as a percentage or a page
number or not at all, sits in the page's bottom corner like a folio, in every layout. The
controls are on two 44 px bars that come up with a tap in the middle of the page, with the
pointer near the top or bottom edge, or with keyboard focus, and step aside a few seconds
later, as they do after the book opens.

## Icons

The icon is a carrel, the study desk the app is named for: a desk walled on three sides, with
a chair drawn up to it. It is flat, in the warm browns of wood, and it sits beside the
wordmark in the library's header. The chair is a mid-tone slate rather than near-black, so it
stays visible on a dark tab strip or theme as well as a light one.

`design/icon.webp` is the artwork. Run `sh design/icons.sh` (ImageMagick 7) after changing it;
that renders the PNGs in `public/icons/`: the favicon, the app's icons, and, on `neutral.50`,
the full-bleed variant for platforms that crop icons to their own shape and the Apple touch
icon.

## Adding to the system

When something needs a value the system lacks, add a token to `design-tokens.json` on
purpose, add any new text pair to `pairs`, and re-run the contrast check. Don't write a
one-off value in a component.
