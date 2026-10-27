import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from 'vitest/config'
import { bookFileTypes } from './src/domain/formats.ts'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The content security policy of the built app.
 *
 * Book pages render in same-origin iframes whose documents are blob: URLs or srcdoc, and
 * such documents inherit this policy. That makes it the backstop that keeps a book's own
 * scripts from running with access to the library: script-src admits only the app's
 * files, never 'unsafe-inline' or blob:. It also keeps reading private: a book can load
 * images, styles, fonts and media only from inside itself (blob: and data:), never from a
 * remote host.
 *
 * The dev server is exempt because Vite injects inline scripts there.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // hash-wasm compiles WebAssembly.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  // pdf.js fetches its CMaps and fonts from the app; FB2 covers are read back from data:.
  // https: lets the reader add a font from a link they paste. Only the app's own code can
  // fetch: book pages run no scripts, and their images, styles and fonts stay local.
  "connect-src 'self' blob: data: https:",
  "frame-src 'self' blob:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function csp(): Plugin {
  return {
    name: 'carrel:csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy },
        injectTo: 'head-prepend',
      },
    ],
  }
}

/**
 * Installable and usable offline: the service worker precaches the whole app, PDF.js's
 * worker, decoders, CMaps and fonts included, so a book already in the library opens with
 * no connection. A new version downloads in the background and waits until the reader
 * chooses to reload (src/ui/library/UpdateNotice.tsx), which registers the worker too.
 */
function pwa() {
  return VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      name: 'Carrel',
      short_name: 'Carrel',
      description: 'An e-book reader that keeps your books in your browser.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f7f9f9',
      theme_color: '#f7f9f9',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
      // Opening a book file with the installed app adds it to the library
      // (src/ui/useLaunchFiles.ts).
      file_handlers: [
        {
          action: '/',
          accept: bookFileTypes,
        },
      ],
      launch_handler: { client_mode: 'focus-existing' },
    },
    workbox: {
      globPatterns: ['**/*.{html,js,mjs,css,svg,png,wasm,bcmap,pfb,ttf,woff2}'],
      // pdf.worker.min.mjs is the largest file, about 1.3 MB. Workbox's default limit, 2 MiB,
      // leaves it little room to grow, and a file over the limit is left out of the precache
      // with no more than a warning in the build.
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      // The app is one page, its routes in the hash. Other pages (the licence notices) are
      // fetched as they are rather than answered with the app.
      navigateFallback: '/index.html',
      navigateFallbackAllowlist: [/^\/(index\.html)?(\?|$)/],
      cleanupOutdatedCaches: true,
    },
  })
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    csp(),
    pwa(),
    // foliate-js's PDF module loads these by absolute URL from /vendor/pdfjs/, which is why
    // the app has to be served from the root of its domain.
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          dest: 'vendor/pdfjs',
          rename: { stripBase: true },
        },
        {
          src: [
            // The image decoders and colour management; not quickjs, which only PDF.js's
            // scripting support uses, and that stays off.
            'node_modules/pdfjs-dist/wasm/{jbig2,openjpeg,qcms_bg}.wasm',
            'node_modules/pdfjs-dist/wasm/*_fallback.js',
          ],
          dest: 'vendor/pdfjs',
          rename: { stripBase: true },
        },
        {
          src: ['node_modules/pdfjs-dist/cmaps/*', 'node_modules/pdfjs-dist/standard_fonts/*'],
          dest: 'vendor/pdfjs',
          rename: { stripBase: 2 },
        },
        {
          src: 'node_modules/foliate-js/vendor/pdfjs/*.css',
          dest: 'vendor/pdfjs',
          rename: { stripBase: true },
        },
        {
          src: ['node_modules/pdfjs-dist/LICENSE', 'node_modules/pdfjs-dist/wasm/LICENSE_*'],
          dest: 'vendor/pdfjs/licenses',
          rename: { stripBase: true },
        },
        // foliate-js bundles its own copy of fflate, which licenses.md can't see.
        {
          src: 'node_modules/fflate/LICENSE',
          dest: 'vendor/fflate',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve('./src'),
      // foliate-js imports pdf.js through this specifier; the module it names must be the
      // same build as the worker copied above.
      '@pdfjs': resolve('./node_modules/pdfjs-dist/build'),
    },
  },
  build: {
    target: 'es2024',
    license: { fileName: 'licenses.md' },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
