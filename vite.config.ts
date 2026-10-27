import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from 'vitest/config'

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
  "connect-src 'self' blob: data:",
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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    csp(),
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
