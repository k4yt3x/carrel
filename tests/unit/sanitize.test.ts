// @vitest-environment jsdom
import type { Book } from 'foliate-js/view.js'
import { describe, expect, it } from 'vitest'
import { guard } from '@/domain/foliate'
import { markupParseType, sanitizeMarkup } from '@/domain/sanitize'

const xhtml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><head><title>t</title></head><body>${body}</body></html>`

const sanitize = (body: string) => sanitizeMarkup(xhtml(body), 'application/xhtml+xml').source

describe('sanitizeMarkup', () => {
  it('removes script elements, including SVG ones', () => {
    const out = sanitize(
      '<p>Text</p><script>steal()</script><svg xmlns="http://www.w3.org/2000/svg"><script>steal()</script></svg>',
    )
    expect(out).not.toContain('steal')
    expect(out).toContain('<p>Text</p>')
  })

  it('removes event handler attributes', () => {
    const out = sanitize('<img src="a.png" onerror="steal()"/><p ONCLICK="steal()">x</p>')
    expect(out).not.toMatch(/onerror|onclick/i)
    expect(out).toContain('src="a.png"')
  })

  it('removes script URLs however they are spelled', () => {
    const out = sanitize(
      '<a href="javascript:steal()">a</a><a href=" JaVa&#9;Script:steal()">b</a><a href="&#10;java&#10;script:steal()">c</a><a href="vbscript:x">d</a><iframe src="data:text/html,&lt;b&gt;"></iframe>',
    )
    const doc = new DOMParser().parseFromString(out, 'application/xhtml+xml')
    const remaining = [...doc.querySelectorAll('a, iframe')].filter(
      (element) => element.hasAttribute('href') || element.hasAttribute('src'),
    )
    expect(remaining).toEqual([])
  })

  it('keeps ordinary links and data images', () => {
    const out = sanitize(
      '<a href="chapter2.xhtml#note">n</a><img src="data:image/png;base64,AA=="/>',
    )
    expect(out).toContain('href="chapter2.xhtml#note"')
    expect(out).toContain('src="data:image/png;base64,AA=="')
  })

  it('removes srcdoc and refresh redirects', () => {
    const out = sanitize(
      '<iframe srcdoc="&lt;script&gt;steal()&lt;/script&gt;"></iframe><meta http-equiv="Refresh" content="0;url=javascript:steal()"/>',
    )
    expect(out).not.toContain('srcdoc')
    expect(out).not.toMatch(/refresh/i)
  })

  it('removes SVG animations that target an href', () => {
    const out = sanitize(
      '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="javascript:steal()"/><text>t</text></a></svg>',
    )
    expect(out).not.toContain('animate')
    expect(out).toContain('<text>t</text>')
  })

  it('removes <noscript>, whose text turns into markup where scripts run', () => {
    const result = sanitizeMarkup(
      '<p>kept</p><noscript><p title="</noscript><img src=x onerror=steal()>"></p></noscript>',
      'text/html',
    )
    expect(result.source).not.toContain('noscript')
    expect(result.source).not.toContain('steal')
    expect(result.source).toContain('kept')
  })

  it('keeps stylesheet links and drops links that only reach a server', () => {
    const out = sanitize(
      '<link rel="stylesheet" href="style.css"/><link rel="preconnect" href="https://tracker.example"/><link rel="dns-prefetch" href="https://tracker.example"/>',
    )
    expect(out).toContain('style.css')
    expect(out).not.toContain('tracker')
  })

  it('treats every kind of XML as markup to sanitize', () => {
    expect(markupParseType('application/xhtml+xml')).toBe('application/xhtml+xml')
    expect(markupParseType('text/html; charset=utf-8')).toBe('text/html')
    expect(markupParseType('application/xml')).toBe('application/xml')
    expect(markupParseType('text/xml')).toBe('application/xml')
    expect(markupParseType('application/x-dtbook+xml')).toBe('application/xml')
    expect(markupParseType('text/css')).toBeNull()
    expect(markupParseType('image/png')).toBeNull()
    const xml = sanitizeMarkup(
      '<doc xmlns:h="http://www.w3.org/1999/xhtml"><h:script>steal()</h:script><p>kept</p></doc>',
      'application/xml',
    )
    expect(xml.source).not.toContain('steal')
    expect(xml.source).toContain('kept')
  })

  it('reparses markup that is not well-formed XML as HTML', () => {
    const result = sanitizeMarkup(
      '<html><body><p>open<br><script>steal()</script></body></html>',
      'application/xhtml+xml',
    )
    expect(result.type).toBe('text/html')
    expect(result.source).not.toContain('steal')
    expect(result.source).toContain('open')
  })
})

describe('guard', () => {
  it('sanitizes the documents of old MOBI books, which have no resource events', async () => {
    const markup = '<p onclick="steal()">kept</p><script>steal()</script>'
    const mobi = {
      createDocument: async () => new DOMParser().parseFromString(markup, 'text/html'),
    }
    guard(mobi as unknown as Book)
    const doc = await mobi.createDocument()
    expect(doc.documentElement.outerHTML).not.toContain('steal')
    expect(doc.body.textContent).toBe('kept')
  })
})
