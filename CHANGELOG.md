# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-29

### Added

- The header shows in Scroll mode too, and can show the book's title instead of the chapter's.
- Header and Footer can be Blank, keeping their band empty so the bars never cover the text.
- The library shows Carrel's version beside its name, on screens wider than a phone's.
- Settings name the commit Carrel was built from, marked dirty if it had uncommitted changes.

### Changed

- Running heads and Progress are now Header and Footer, in bands as tall as the bars.
- The bars come up over these bands instead of the text, and the bottom bar shows the progress.
- In Scroll mode the text scrolls between the bands, no longer under the progress.
- Hide, in place of None, removes a band and gives its space to the text.
- The library's icon and title are as tall as the controls beside them.

## [0.3.0] - 2026-10-29

### Added

- Plain-text (TXT) books, in any common encoding, divided into chapters at their headings.
- Each book in the library is labelled with its format: EPUB, PDF, TXT and so on.
- Ctrl+F (or ⌘F) in the library goes to its search.

### Changed

- The library's header is tidier: Select is a button, grouped with search, sort and covers or list.

## [0.2.0] - 2026-10-29

### Added

- Home and End go to the beginning and the end of the book.
- Settings show Carrel's version and link to its source code.

### Changed

- A new icon: a study carrel, a desk walled on three sides.
- A new version is offered when you come back to the app, not only when it starts.
- In a scrolled PDF or comic, Page Up, Page Down, the arrows and side taps turn a page at a time.
- Space in a scrolled PDF or comic goes a screenful at a time, stopping at the edges of pages.
- The progress of a PDF or comic sits beside the page rather than on it, where there is room.
- Adding many books no longer slows as the library grows: 1,500 take 30 seconds, not 5 minutes.
- A large library opens faster and stays quick to search and scroll.
- Carrel downloads 1 MB less to work offline, and less code before the library shows.

### Fixed

- On iPhone and iPad, MOBI, AZW3, FB2 and CBZ books can be chosen in the file picker.
- On an iPhone or iPad Home Screen, saving a book or backup opens the share sheet, not a dead end.
- On iPhone and iPad, a backup that takes a while to make asks for a second tap to save it.
- PDFs open in older browsers too, from Safari 18 on.
- Tapping a text field or a menu on a phone no longer zooms the page in.
- Nothing sits under a phone's notch, Dynamic Island or home indicator.
- Books can be added with Lockdown Mode on.
- Under Whole page, a scrolled PDF or comic page fills the window's height instead of falling short.
- A library too large for memory can be backed up in Firefox, Safari and on phones and tablets.

## [0.1.1] - 2026-10-27

### Changed

- PDFs and comics zoom from 10% to 500% of the fitted size, in finer steps around 100%.

### Fixed

- The notice that books were added goes after a few seconds, even if a book is opened meanwhile.
- The drop target goes away when files dragged over the page are taken away without a drop.
- Scrolled PDFs and comics fit a whole page to the window's height under Whole page.
- A PDF or comic opened for the first time in scrolled layout starts at the top of its first page.

## [0.1.0] - 2026-10-27

### Added

- A library of EPUB, MOBI, AZW3, FB2, CBZ and PDF books, kept in the browser's own storage.
- Books are added from the file picker, by dropping them on the page, or with "Open with".
- A book already in the library is recognised by its contents and not added twice.
- The library shows covers or a list, searched and sorted by last read, added, title or author.
- Several books are chosen and removed together; Shift-click chooses a run of them.
- A book's details: description, publisher, date, language, subjects, file and progress.
- Paged or scrolled layout, one or two columns, page-turn animations and full screen.
- The reader's bars come up with a tap, with the pointer near the top or bottom, or by keyboard.
- A table of contents that docks beside the page on a wide window, folds and resizes.
- Buttons for the beginning, the end and the next or previous chapter, and a position slider.
- The progress in the page's corner as a percentage or a page number, or not at all.
- Search within a book, footnotes in a popup, and running heads in paged layout.
- Text centred on the window, with an offset for a window that isn't centred on the screen.
- Type settings: typeface, size, spacing, alignment, paragraphs, hyphenation, margins and more.
- Custom CSS, and settings for every book or for one book alone.
- Typefaces from the fonts installed on the device, and fonts added from files or a link.
- Light, dark and automatic themes, and themes made from three colours, followed by the page.
- Fit to page or width, zoom and facing pages for PDFs and comics.
- Backup and restore of the library, with books, places, fonts and settings, as one zip file.
- Installable as an app, and usable offline once loaded.
- Tips that name the icon-only buttons, with their keyboard shortcuts.
- Keys: the arrows, Page Up, Page Down and Space turn pages; Ctrl+F searches the book.

[Unreleased]: https://github.com/k4yt3x/carrel/compare/0.4.0...HEAD
[0.4.0]: https://github.com/k4yt3x/carrel/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/k4yt3x/carrel/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/k4yt3x/carrel/compare/0.1.1...0.2.0
[0.1.1]: https://github.com/k4yt3x/carrel/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/k4yt3x/carrel/releases/tag/0.1.0
