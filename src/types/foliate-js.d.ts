/**
 * Types for the parts of foliate-js (readest/foliate-js) that carrel uses. The library is
 * plain JavaScript; these are written from its source at the pinned commit.
 */
declare module 'foliate-js/view.js' {
  export interface TocItem {
    label: string
    href: string
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
    feet?: HTMLElement[] | null
    /** One string goes after the book's own styles; a pair goes before and after them. */
    setStyles?(css: string | [before: string, after: string]): void
    next(): Promise<void>
    prev(): Promise<void>
  }

  export interface ViewEventMap extends HTMLElementEventMap {
    relocate: CustomEvent<RelocateDetail>
    load: CustomEvent<LoadDetail>
    'external-link': CustomEvent<ExternalLinkDetail>
  }

  export interface View extends HTMLElement {
    book: Book
    renderer: Renderer
    isFixedLayout: boolean
    open(book: Book | File): Promise<void>
    close(): void
    init(options: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>
    goTo(target: string | number): Promise<unknown>
    goToFraction(fraction: number): Promise<void>
    prev(): Promise<void>
    next(): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
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
