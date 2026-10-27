/**
 * Strips script from a book's markup before foliate-js renders it.
 *
 * Book pages render in iframes on the app's own origin, so a script in a book would run with
 * full access to the library. The built app's content security policy refuses such scripts
 * as well; this removes them at the source so that nothing depends on the policy being
 * inherited by blob: documents, and so the dev server, which runs without the policy, is
 * covered too.
 */

const markupTypes = new Set(['application/xhtml+xml', 'text/html', 'image/svg+xml'])

export function isMarkupType(type: string): type is DOMParserSupportedType {
  return markupTypes.has(type)
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

function strip(doc: Document): void {
  for (const element of doc.querySelectorAll('script')) element.remove()
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
 *
 * Markup that is not well-formed XML is reparsed as HTML, the way a browser would end up
 * rendering it, and the returned type says so.
 */
export function sanitizeMarkup(
  source: string,
  type: DOMParserSupportedType,
): { source: string; type: DOMParserSupportedType } {
  const parser = new DOMParser()
  let doc = parser.parseFromString(source, type)
  let resultType = type
  if (type !== 'text/html' && doc.getElementsByTagName('parsererror').length > 0) {
    doc = parser.parseFromString(source, 'text/html')
    resultType = 'text/html'
  }
  strip(doc)
  if (resultType === 'text/html') {
    const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : ''
    return { source: doctype + doc.documentElement.outerHTML, type: resultType }
  }
  return { source: new XMLSerializer().serializeToString(doc), type: resultType }
}
