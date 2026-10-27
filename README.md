# Carrel

An e-book reader that runs entirely in your browser. Add EPUB, MOBI, AZW3, FB2, CBZ and PDF
files to your library and read them; they are kept in the browser's own storage and never
leave your device. There are no accounts, no servers and no tracking.

Carrel renders books with [Readest's fork of foliate-js](https://github.com/readest/foliate-js)
and PDF.js.

- A library of covers or a list, searched and sorted, with books chosen and removed together
- Paged or scrolling layout, one or two columns, page-turn animations, full screen
- Light and dark themes, and themes of your own colours, that the book pages follow
- Type settings: typeface, size, line spacing, alignment, paragraph style, hyphenation,
  spacing, margins, line length and custom CSS, for all books or for one book
- Your own fonts, from files or from a link (Google Fonts, jsDelivr, cdnjs and the like)
- Search within a book, footnotes in a popup, a table of contents beside the page, running
  heads, and the progress in the page's corner
- Fit to page or width and facing pages for PDFs and comics
- Backup and restore of the whole library, books included, as one zip file
- Installable, and works offline once loaded

## Privacy

The app is a set of static files. Once loaded, it talks to nothing but the site it came from,
except when you add a font from a link, which it downloads from that link. Its content security
policy also stops books from running scripts or loading anything from the network, so a book
can't phone home either.

Browsers may clear a site's storage when space runs short, and Safari clears it for sites you
haven't visited in a while. Carrel asks the browser to keep its storage; back up the library
from Settings, or keep the original files of books you care about.

## Development

Carrel uses [pnpm](https://pnpm.io) and Node.js 26.

```sh
pnpm install
pnpm dev          # development server at http://localhost:5173
pnpm lint         # Biome
pnpm typecheck
pnpm test         # unit tests
pnpm test:e2e     # browser tests against a production build
pnpm build        # production build in dist/
```

The browser tests need Chromium: run `pnpm exec playwright install chromium` once, or point
`CHROMIUM_PATH` at an installed Chromium.

The design system lives in [`design/`](design/DESIGN.md). Edit `design/design-tokens.json`
and run `pnpm design:emit` to regenerate the theme.

## Deployment

The build in `dist/` is a static site. It must be served from the root of its domain:
foliate-js loads PDF.js's worker, fonts and character maps from `/vendor/pdfjs/`, so a copy
served under a sub-path (such as `user.github.io/carrel/`) cannot open PDFs.

`.github/workflows/ci.yml` checks every push and pull request. Pushing a release tag, such as
`0.1.0`, also builds the site and deploys it to GitHub Pages. In the repository settings, set
Pages to deploy from GitHub Actions and set the custom domain, and under Environments, let the
`github-pages` environment deploy from tags.

Changes are listed in [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT. The production build includes `licenses.md`, which lists the licenses of the bundled
dependencies; PDF.js's licenses are in `vendor/pdfjs/licenses/`, and that of fflate, which
foliate-js bundles, in `vendor/fflate/`.
