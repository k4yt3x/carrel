import { describe, expect, it } from 'vitest'
import { chapterDocument, decodeText, divideText } from '@/domain/txt'

const bytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
const utf8 = (text: string) => new TextEncoder().encode(text)

// The same few lines in the legacy encodings of Chinese, Japanese, Korean, Russian and French.
const legacy = {
  gbk: 'b5dad2bbd5c220b9e9c0b40acbfbcbb5a3baa1b0ced2c3c7b5c4c9fabbeecac7b2bbcac7badcbac3a3bfd5e2b8f6c8cbd4dad5e2c0efa1a3a1b1ced2b2bbd6aab5c0cbfbc3c7ceaacab2c3b4d2aac0b4a1a30a',
  big5: 'b2c4a440b3b920c26ba8d30aa54cbba1a147a175a7daadccaabaa5cdaca1ac4fa4a3ac4fabdca66ea148b36fadd3a448a662b36fb8cca143a176a7daa4a3aabeb944a54cadccacb0a4b0bbf2ad6ea8d3a1430a',
  shiftJis:
    '91e688ea8fcd208b418ad20a82b182ea82cd93fa967b8cea82cc95b68fcd82c582b781428e8482cd967b82f093c782f182c582a282dc82b7814294de82cd82bb82ea82f0926d82e782c882a982c182bd81420a',
  eucKr:
    'c1a631c0e520b1cdc8af0ac0ccb0cdc0ba20c7d1b1b9beee20b9aec0e5c0d4b4cfb4d92e20b3aab4c220c3a5c0bb20c0d0b0ed20c0d6b4d92e20b1d7b4c220b1d7b0cdc0bb20b8f4b6fab4d92e0a',
  windows1251:
    'c3ebe0e2e020310acff0e8e2e5f22c20ece8f02e20ddf2ee20eaede8e3e020ee20f2eeec2c20eae0ea20eeed20f7e8f2e0eb20e5b820e220e1e8e1ebe8eef2e5eae52e0a',
  windows1252:
    '436861706974726520310a496c20e97461697420756e6520666f697320756e20636166e9206ff9206c926f6e206c697361697420e0206c92e974e92e0a',
}

describe('decodeText', () => {
  it('reads Unicode by its byte order mark, or by being valid UTF-8', () => {
    expect(decodeText(Uint8Array.of(0xef, 0xbb, 0xbf, ...utf8('Émile')), [])).toBe('Émile')
    expect(decodeText(Uint8Array.of(0xff, 0xfe, 0x48, 0, 0x69, 0), [])).toBe('Hi')
    expect(decodeText(Uint8Array.of(0xfe, 0xff, 0, 0x48, 0, 0x69), [])).toBe('Hi')
    expect(decodeText(utf8('第一章 归来'), [])).toBe('第一章 归来')
  })

  it('tells the legacy encodings of Chinese, Japanese and Korean apart by what they read', () => {
    expect(decodeText(bytes(legacy.gbk), ['en'])).toContain('我们的生活是不是很好？')
    expect(decodeText(bytes(legacy.big5), ['en'])).toContain('我們的生活是不是很好？')
    expect(decodeText(bytes(legacy.shiftJis), ['en'])).toContain('これは日本語の文章です。')
    expect(decodeText(bytes(legacy.eucKr), ['en'])).toContain('이것은 한국어 문장입니다.')
  })

  it('reads single-byte text as the script its bytes suggest, in the reader’s encoding', () => {
    expect(decodeText(bytes(legacy.windows1251), ['en'])).toContain('Привет, мир.')
    expect(decodeText(bytes(legacy.windows1252), ['ru', 'en'])).toContain('Il était une fois')
    const polish = bytes(
      '4279b36120736f6269652072617a20647a696577637a796e6b612c206b74f37261206d6965737a6b61b3612077206d61b3796d20646f6d75206e616420727a656bb92e',
    )
    expect(decodeText(polish, ['pl'])).toBe(
      'Była sobie raz dziewczynka, która mieszkała w małym domu nad rzeką.',
    )
  })

  it('refuses a file that holds something other than text', () => {
    expect(() => decodeText(Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0, 0, 0x08, 0), [])).toThrow()
  })
})

describe('divideText', () => {
  it('joins lines broken at a width, and parts paragraphs at blank lines', () => {
    const text = [
      'The Project Gutenberg eBook of a Tale',
      '',
      'CHAPTER I.',
      '',
      'It was the best of times, it was the worst of times, it was the age of',
      'wisdom, it was the age of foolishness.',
      '',
      'There were a king with a large jaw and a queen with a plain face, on the',
      'throne of England.',
      '',
      'CHAPTER II. The Mail',
      '',
      'It was the Dover road that lay, on a Friday night late in November, before',
      'the first of the persons with whom this history has business.',
    ].join('\r\n')
    expect(divideText(text)).toEqual([
      { heading: null, paragraphs: ['The Project Gutenberg eBook of a Tale'] },
      {
        heading: 'CHAPTER I.',
        paragraphs: [
          'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.',
          'There were a king with a large jaw and a queen with a plain face, on the throne of England.',
        ],
      },
      {
        heading: 'CHAPTER II. The Mail',
        paragraphs: [
          'It was the Dover road that lay, on a Friday night late in November, before the first of the persons with whom this history has business.',
        ],
      },
    ])
  })

  it('finds headings in text broken at a width, without taking the text after them', () => {
    const text = [
      'CHAPTER I.',
      'Down the Rabbit-Hole',
      '',
      'Alice was beginning to get very tired of sitting by her sister on the',
      'bank, and of having nothing to do.',
      'CHAPTER II. The Pool of Tears',
      'Curiouser and curiouser, cried Alice; she was so much surprised that',
      'for the moment she quite forgot how to speak good English.',
      '',
      'She went on planning to herself how she would manage it, as told in',
      'Book Two of the stories her sister knew',
      'so well.',
      '',
      'CHAPTER III',
      'They were indeed a queer-looking party',
      'that assembled on the bank.',
    ].join('\n')
    expect(divideText(text)).toEqual([
      {
        heading: 'CHAPTER I. Down the Rabbit-Hole',
        paragraphs: [
          'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.',
        ],
      },
      {
        heading: 'CHAPTER II. The Pool of Tears',
        paragraphs: [
          'Curiouser and curiouser, cried Alice; she was so much surprised that for the moment she quite forgot how to speak good English.',
          'She went on planning to herself how she would manage it, as told in Book Two of the stories her sister knew so well.',
        ],
      },
      {
        heading: 'CHAPTER III',
        paragraphs: ['They were indeed a queer-looking party that assembled on the bank.'],
      },
    ])
  })

  it('finds headings in Chinese broken at a width, and keeps rules apart', () => {
    const text = [
      '第一回　甄士隱夢幻識通靈',
      '-----------------',
      '此開卷第一回也．作者自云：因曾歷過一番夢幻之后，故將真事隱去，',
      '而借通靈之說，撰此《石頭記》一書也',
      '．',
      '',
      '　　列位看官：你道此書從何而來？說起根由雖近荒唐，細按則深有趣味．待在下將',
      '此來歷注明，方使閱者了然不惑．',
      '意欲喚取進京之',
      '第二回',
      '',
      '　　卻說雨村忙回頭看時，不是別人，乃是當日同僚一案參革的號張如圭者．他本系',
      '此地人，革后家居．',
    ].join('\n')
    expect(divideText(text)).toEqual([
      {
        heading: '第一回　甄士隱夢幻識通靈',
        paragraphs: [
          '-----------------',
          '此開卷第一回也．作者自云：因曾歷過一番夢幻之后，故將真事隱去，而借通靈之說，撰此《石頭記》一書也．',
          '列位看官：你道此書從何而來？說起根由雖近荒唐，細按則深有趣味．待在下將此來歷注明，方使閱者了然不惑．意欲喚取進京之',
        ],
      },
      {
        heading: '第二回',
        paragraphs: [
          '卻說雨村忙回頭看時，不是別人，乃是當日同僚一案參革的號張如圭者．他本系此地人，革后家居．',
        ],
      },
    ])
  })

  it('takes each line as a paragraph where lines are not broken at a width', () => {
    const text = [
      '　　第一章 归来',
      '　　他说：“我们的生活是不是很好？这个人在这里。”',
      '　　“是的。”',
      '第2章风起',
      '　　我不知道他们为什么要来。',
    ].join('\n')
    expect(divideText(text)).toEqual([
      {
        heading: '第一章 归来',
        paragraphs: ['他说：“我们的生活是不是很好？这个人在这里。”', '“是的。”'],
      },
      { heading: '第2章风起', paragraphs: ['我不知道他们为什么要来。'] },
    ])
  })

  it('joins broken lines of Chinese without a space', () => {
    const text = [
      '第一回',
      '',
      '他说我们的生活',
      '是不是很好。',
      '',
      '这个人在这里，',
      '我不知道他们',
      '为什么要来。',
      '',
      '好。',
    ].join('\n')
    expect(divideText(text)[0]?.paragraphs).toEqual([
      '他说我们的生活是不是很好。',
      '这个人在这里，我不知道他们为什么要来。',
      '好。',
    ])
  })

  it('keeps a heading with no text after it as text, such as a table of contents', () => {
    const text = [
      'Contents',
      'Chapter 1',
      'Chapter 2',
      'Part One',
      'Chapter 1',
      'Call me Ishmael.',
    ].join('\n')
    expect(divideText(text)).toEqual([
      { heading: null, paragraphs: ['Contents', 'Chapter 1', 'Chapter 2', 'Part One'] },
      { heading: 'Chapter 1', paragraphs: ['Call me Ishmael.'] },
    ])
  })

  it('reads lines that only begin as headings do as prose', () => {
    const lines = [
      'Part two of the plan failed.',
      'Book one is better, she said,',
      'Chapter 12 was where it ended.',
      '第三章写完了。他说：',
      'Introduction to the method.',
      'Chaptered and bound.',
      'Volume 3',
      'And so on.',
    ]
    expect(divideText(lines.join('\n'))).toEqual([
      { heading: null, paragraphs: lines.slice(0, 6) },
      { heading: 'Volume 3', paragraphs: ['And so on.'] },
    ])
  })

  it('gives a text without headings one chapter, and an empty text none', () => {
    expect(divideText('One line.\nAnother.')).toEqual([
      { heading: null, paragraphs: ['One line.', 'Another.'] },
    ])
    expect(divideText(' \n\u3000\n\r\n\f')).toEqual([])
  })
})

describe('chapterDocument', () => {
  it('writes the text as text, never as markup', () => {
    const html = chapterDocument({
      heading: '<b>1</b>',
      paragraphs: ['a < b & <script>x</script>'],
    })
    expect(html).toContain('<h2>&lt;b&gt;1&lt;/b&gt;</h2>')
    expect(html).toContain('<p>a &lt; b &amp; &lt;script&gt;x&lt;/script&gt;</p>')
    expect(html).not.toContain('<script>')
  })
})
