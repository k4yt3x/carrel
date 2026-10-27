# Carrel

An e-book reader that runs entirely in your browser. Add EPUB, MOBI, AZW3, FB2, CBZ and PDF
files to your library and read them; they are kept in the browser's own storage and never
leave your device. There are no accounts, no servers and no tracking.

Carrel renders books with [Readest's fork of foliate-js](https://github.com/readest/foliate-js)
and PDF.js.

## Privacy

The app is a set of static files. Once loaded, it talks to nothing but the site it came from.
Its content security policy also stops books from running scripts or loading anything from the
network, so a book can't phone home either.

Browsers may clear a site's storage when space runs short, and Safari clears it for sites you
haven't visited in a while. Carrel asks the browser to keep its storage, but keep the original
files of books you care about.

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

Pushes to `master` are built and deployed to GitHub Pages by `.github/workflows/ci.yml`. In the
repository settings, set Pages to deploy from GitHub Actions and set the custom domain.

## License

MIT. The production build includes `licenses.md`, which lists the licenses of the bundled
dependencies; PDF.js's licenses are in `vendor/pdfjs/licenses/`.
