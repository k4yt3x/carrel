/**
 * Synthetic font files for the font tests: only the tables Carrel reads, laid out as a real
 * TrueType, OpenType or WOFF 1.0 file lays them out.
 */

import { deflateSync } from 'node:zlib'

export interface NameRecord {
  platform: number
  encoding: number
  language: number
  nameId: number
  value: string
}

/** A Windows Unicode name record, in US English unless another language is given. */
export const windowsName = (nameId: number, value: string, language = 0x0409): NameRecord => ({
  platform: 3,
  encoding: 1,
  language,
  nameId,
  value,
})

/** A Mac Roman name record in English; `value` must be ASCII. */
export const macName = (nameId: number, value: string): NameRecord => ({
  platform: 1,
  encoding: 0,
  language: 0,
  nameId,
  value,
})

function encodeName({ platform, value }: NameRecord): Uint8Array {
  if (platform !== 3) return Uint8Array.from(value, (char) => char.charCodeAt(0))
  const bytes = new Uint8Array(value.length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value.charCodeAt(i))
  return bytes
}

export function nameTable(records: readonly NameRecord[]): Uint8Array<ArrayBuffer> {
  const encoded = records.map((record) => ({ record, bytes: encodeName(record) }))
  const storage = 6 + 12 * records.length
  const table = new Uint8Array(storage + encoded.reduce((sum, { bytes }) => sum + bytes.length, 0))
  const view = new DataView(table.buffer)
  view.setUint16(2, records.length)
  view.setUint16(4, storage)
  let offset = 0
  for (const [i, { record, bytes }] of encoded.entries()) {
    const at = 6 + 12 * i
    view.setUint16(at, record.platform)
    view.setUint16(at + 2, record.encoding)
    view.setUint16(at + 4, record.language)
    view.setUint16(at + 6, record.nameId)
    view.setUint16(at + 8, bytes.length)
    view.setUint16(at + 10, offset)
    table.set(bytes, storage + offset)
    offset += bytes.length
  }
  return table
}

/** A version 4 OS/2 table with the given weight class and the italic or regular bit set. */
export function os2Table(weight: number, italic: boolean): Uint8Array<ArrayBuffer> {
  const table = new Uint8Array(96)
  const view = new DataView(table.buffer)
  view.setUint16(0, 4)
  view.setUint16(4, weight)
  view.setUint16(62, italic ? 0x0001 : 0x0040)
  return table
}

export interface FontOptions {
  names?: readonly NameRecord[]
  weight?: number
  italic?: boolean
  /** Tables to write in place of the `name` and `OS/2` tables built from the options above. */
  tables?: Readonly<Record<string, Uint8Array>>
}

function tablesOf({
  names = [windowsName(1, 'Test Serif')],
  weight = 400,
  italic = false,
  tables,
}: FontOptions): [string, Uint8Array][] {
  const entries = Object.entries(
    tables ?? { name: nameTable(names), 'OS/2': os2Table(weight, italic) },
  )
  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

const align = (offset: number) => (offset + 3) & ~3

function writeTag(bytes: Uint8Array, at: number, tag: string) {
  for (let i = 0; i < 4; i++) bytes[at + i] = tag.charCodeAt(i)
}

/** A TrueType file, or an OpenType one with CFF outlines by its signature. */
export function sfnt(
  options: FontOptions & { flavor?: 'truetype' | 'opentype' } = {},
): Uint8Array<ArrayBuffer> {
  const tables = tablesOf(options)
  const offsets: number[] = []
  let end = align(12 + 16 * tables.length)
  for (const [, data] of tables) {
    offsets.push(end)
    end = align(end + data.length)
  }
  const bytes = new Uint8Array(end)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, options.flavor === 'opentype' ? 0x4f54544f : 0x00010000)
  view.setUint16(4, tables.length)
  for (const [i, [tag, data]] of tables.entries()) {
    const record = 12 + 16 * i
    const offset = offsets[i] ?? 0
    writeTag(bytes, record, tag)
    view.setUint32(record + 8, offset)
    view.setUint32(record + 12, data.length)
    bytes.set(data, offset)
  }
  return bytes
}

/** The WOFF 1.0 form of a font, each table deflated where that makes it smaller. */
export function woff(options: FontOptions = {}): {
  bytes: Uint8Array<ArrayBuffer>
  /** The tags of the tables stored deflated. */
  compressed: string[]
} {
  const tables = tablesOf(options).map(([tag, data]) => {
    const deflated = deflateSync(data)
    return { tag, data, stored: deflated.length < data.length ? deflated : data }
  })
  const offsets: number[] = []
  let end = 44 + 20 * tables.length
  for (const { stored } of tables) {
    offsets.push(end)
    end = align(end + stored.length)
  }
  const bytes = new Uint8Array(end)
  const view = new DataView(bytes.buffer)
  writeTag(bytes, 0, 'wOFF')
  view.setUint32(4, 0x00010000)
  view.setUint32(8, end)
  view.setUint16(12, tables.length)
  view.setUint32(
    16,
    tables.reduce((size, { data }) => size + align(data.length), 12 + 16 * tables.length),
  )
  view.setUint16(20, 1)
  for (const [i, { tag, data, stored }] of tables.entries()) {
    const record = 44 + 20 * i
    const offset = offsets[i] ?? 0
    writeTag(bytes, record, tag)
    view.setUint32(record + 4, offset)
    view.setUint32(record + 8, stored.length)
    view.setUint32(record + 12, data.length)
    bytes.set(stored, offset)
  }
  const compressed = tables.filter(({ data, stored }) => stored !== data).map(({ tag }) => tag)
  return { bytes, compressed }
}

/** A WOFF2 header; nothing past it is read without Brotli. */
export function woff2(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(48)
  writeTag(bytes, 0, 'wOF2')
  return bytes
}

export const ascii = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(text, (char) => char.charCodeAt(0))
