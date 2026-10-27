/**
 * Strips script from a book's markup before foliate-js renders it.
 *
 * Book pages render in iframes on the app's own origin, so a script in a book would run with
 * full access to the library. The built app's content security policy refuses such scripts
 * as well; this removes them at the source so that nothing depends on the policy being
 * inherited by blob: documents, and so the dev server, which runs without the policy, is
 * covered too.
 */

const parsedAs = new Set<string>(['application/xhtml+xml', 'text/html', 'image/svg+xml'])

/**
 * How a resource of this media type is parsed for sanitizing, or null when it isn't markup a
 * browser renders as a document. Any XML can be: an XHTML <script> in it runs.
 */
export function markupParseType(type: string): DOMParserSupportedType | null {
  const essence = type.split(';')[0]?.trim().toLowerCase() ?? ''
  if (parsedAs.has(essence)) return essence as DOMParserSupportedType
  if (essence === 'application/xml' || essence === 'text/xml' || essence.endsWith('+xml')) {
    return 'application/xml'
  }
  return null
}

/** URL schemes that run script or render a document when followed. */
function runsScript(value: string): boolean {
  // URL parsing ignores ASCII whitespace and control characters, so `java\tscript:` is a
  // javascript: URL and has to be caught as one.
  const normalized = value.replace(/[\s\p{Cc}]+/gu, '').toLowerCase()
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html')
  )
}

/** Removes what runs script from a parsed document, in place. */
export function sanitizeDocument(doc: Document): void {
  for (const element of doc.querySelectorAll('script')) element.remove()
  // Parsed here without scripting, a <noscript> holds elements; rendered in a page that has
  // scripting, it is reparsed as raw text, which can turn an attribute's text into markup.
  for (const element of doc.querySelectorAll('noscript')) element.remove()
  // A book links stylesheets; any other link (preconnect, prefetch...) only reaches out to a
  // server, which the content security policy doesn't stop for all of them.
  for (const element of doc.querySelectorAll('link')) {
    const rel = element.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? []
    if (!rel.includes('stylesheet')) element.remove()
  }
  for (const element of doc.querySelectorAll('meta[http-equiv]')) {
    if (element.getAttribute('http-equiv')?.toLowerCase() === 'refresh') element.remove()
  }
  // SVG animation can set an href to a script URL that no attribute holds statically.
  for (const element of doc.querySelectorAll('animate, set')) {
    if (/href$/i.test(element.getAttribute('attributeName') ?? '')) element.remove()
  }
  for (const element of doc.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase()
      // srcdoc creates a same-origin document inside the page that this pass never sees.
      if (name.startsWith('on') || name === 'srcdoc' || runsScript(attribute.value)) {
        element.removeAttributeNode(attribute)
      }
    }
  }
}

/**
 * Returns the markup without scripts, event handler attributes, script URLs or srcdoc.
 * `rewrite`, when given, makes further changes to the parsed document before it is written
 * out, so the markup is parsed once for both.
 *
 * Markup that is not well-formed XML is reparsed as HTML, the way a browser would end up
 * rendering it, and the returned type says so.
 */
export function sanitizeMarkup(
  source: string,
  type: DOMParserSupportedType,
  rewrite?: (doc: Document) => void,
): { source: string; type: DOMParserSupportedType } {
  const parser = new DOMParser()
  let doc = parser.parseFromString(source, type)
  let resultType = type
  if (type !== 'text/html' && doc.getElementsByTagName('parsererror').length > 0) {
    doc = parser.parseFromString(source, 'text/html')
    resultType = 'text/html'
  }
  sanitizeDocument(doc)
  rewrite?.(doc)
  if (resultType === 'text/html') {
    const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : ''
    return { source: doctype + doc.documentElement.outerHTML, type: resultType }
  }
  return { source: new XMLSerializer().serializeToString(doc), type: resultType }
}
