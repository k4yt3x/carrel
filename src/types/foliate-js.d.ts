/**
 * Types for the parts of foliate-js (readest/foliate-js) that carrel uses. The library is
 * plain JavaScript; these are written from its source at the pinned commit.
 */
declare module 'foliate-js/view.js' {
  /**
   * An entry of a table of contents. A heading that links nowhere has no href (EPUB's <span>
   * entries, a PDF outline item without a destination), and an entry can have no label.
   */
  export interface TocItem {
    label?: string | null
    href?: string | null
    subitems?: TocItem[] | null
  }

  /** Fired on `book.transformTarget` before a resource of an EPUB is loaded. */
  export interface ResourceLoadDetail {
    type: string
    href: string
    isScript: boolean
    allow: boolean
  }

  /** Fired on `book.transformTarget` with a resource's content; the listener may replace it. */
  export interface ResourceDataDetail {
    data: unknown
    type: string | Promise<string>
    readonly name?: string
  }

  export interface Book {
    /** Raw metadata, in whichever shape the format produced. */
    metadata?: unknown
    toc?: TocItem[] | null
    sections: unknown[]
    dir?: string
    rendition?: { layout?: string }
    transformTarget?: EventTarget
    getCover?(): Promise<Blob | null> | Blob | null
    destroy?(): void
  }

  export class NotFoundError extends Error {}
  export class UnsupportedTypeError extends Error {}

  export function makeBook(file: File): Promise<Book>

  export interface RelocateDetail {
    fraction: number
    section?: { current: number; total: number }
    location?: { current: number; next: number; total: number }
    tocItem?: TocItem | null
    pageItem?: { label: string } | null
    cfi: string
    /** The text on show, in the section's document. */
    range?: Range | null
  }

  export interface LoadDetail {
    doc: Document
    index: number
  }

  export interface ExternalLinkDetail {
    a: HTMLAnchorElement
    href: string
  }

  export interface Renderer extends HTMLElement {
    heads?: HTMLElement[] | null
    /** One string goes after the book's own styles; a pair goes before and after them. */
    setStyles?(css: string | [before: string, after: string]): void
    /** The documents on screen; fixed-layout renderers have none to give. */
    getContents?(): { doc: Document; index: number }[]
    next(): Promise<void>
    prev(): Promise<void>
  }

  /** An internal link was followed; cancelling the event keeps the view where it is. */
  export interface LinkDetail {
    a: HTMLAnchorElement
    href: string
  }

  export interface ViewEventMap extends HTMLElementEventMap {
    relocate: CustomEvent<RelocateDetail>
    load: CustomEvent<LoadDetail>
    'external-link': CustomEvent<ExternalLinkDetail>
    link: CustomEvent<LinkDetail>
  }

  export interface SearchOptions {
    query: string
    matchCase?: boolean
    matchDiacritics?: boolean
    matchWholeWords?: boolean
    /** Searches one section only. */
    index?: number
  }

  export interface SearchMatch {
    cfi: string
    excerpt: { pre: string; match: string; post: string }
  }

  /**
   * What `View.search` yields while it works through the book: how far it has got, the
   * matches in one section (labelled with that section's chapter), and finally 'done'.
   */
  export type SearchEvent =
    | { progress: number }
    | { index: number; label: string; subitems: SearchMatch[] }
    | 'done'

  export interface View extends HTMLElement {
    book: Book
    renderer: Renderer
    isFixedLayout: boolean
    open(book: Book | File): Promise<void>
    close(): void
    init(options: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>
    goTo(target: string | number): Promise<unknown>
    goToFraction(fraction: number): Promise<void>
    /** Where a CFI, href or section index leads; undefined when it leads nowhere in the book. */
    resolveNavigation(target: string | number): unknown
    /** In scrolled layout, `distance` scrolls by that many pixels instead of a screenful. */
    prev(distance?: number): Promise<void>
    next(distance?: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    /** Scrolls the page by so many pixels, as a drag would. */
    pan(dx: number, dy: number): Promise<void>
    /** Searches the text and highlights what it finds, until `clearSearch`. */
    search(options: SearchOptions): AsyncGenerator<SearchEvent>
    clearSearch(): void
    addEventListener<K extends keyof ViewEventMap>(
      type: K,
      listener: (this: View, event: ViewEventMap[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void
  }
}

declare module 'foliate-js/footnotes.js' {
  import type { Book, LinkDetail, View } from 'foliate-js/view.js'

  export interface FootnoteRenderDetail {
    /** A view of its own showing just the note, ready to be placed in a popup. */
    view: View
    href: string
    /** 'footnote', 'endnote', 'note', 'definition', 'biblioentry' or null when unknown. */
    type: string | null
    /** Whether the note is hidden in the text, so following the link would show nothing. */
    hidden: boolean
  }

  export interface FootnoteHandlerEventMap {
    'before-render': CustomEvent<{ view: View }>
    render: CustomEvent<FootnoteRenderDetail>
  }

  /** Recognises links to footnotes and renders the note in a view of its own. */
  export class FootnoteHandler extends EventTarget {
    detectFootnotes: boolean
    /**
     * Takes a view's 'link' event. For a note it cancels the event and returns a promise that
     * settles once 'render' has fired; for any other link it returns undefined.
     */
    handle(book: Book, event: CustomEvent<LinkDetail>): Promise<void> | undefined
    addEventListener<K extends keyof FootnoteHandlerEventMap>(
      type: K,
      listener: (event: FootnoteHandlerEventMap[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
  }
}

declare module 'foliate-js/overlayer.js' {
  export interface OutlineOptions {
    color?: string
    width?: number
    padding?: number
    radius?: number
  }

  /** Draws marks over a page (a class of static drawing functions); the view uses `outline` for search matches. */
  export const Overlayer: {
    outline(rects: unknown, options?: OutlineOptions): SVGElement
  }
}
