import { describe, it, expect } from 'vitest'
import { estimatePages, lineLocation } from './pageEstimate'
import { rebuildOffsets, type DocModel, type Paragraph } from './docModel'
import { docIdFromUrl, mapApiDoc } from './googleDocs'

const LETTER = { pageWidthPt: 612, pageHeightPt: 792 }
const ONE_INCH = { topPt: 72, bottomPt: 72, leftPt: 72, rightPt: 72 }

let n = 0
const para = (text: string, extra: Partial<Paragraph> = {}): Paragraph => ({
  id: `p${n++}`,
  kind: 'normal',
  runs: [{ text, fontSize: 11 }],
  ...extra,
})

const doc = (paragraphs: Paragraph[], extra: Partial<DocModel> = {}): DocModel =>
  rebuildOffsets({
    id: 'd',
    title: 't',
    defaultFontSize: 11,
    linesPerPage: 46,
    ...LETTER,
    margins: ONE_INCH,
    paragraphs,
    ...extra,
  })

// About 85 characters fit on a 6.5in line at 11pt, so this is one full line.
const LINE = 'x'.repeat(80)

describe('estimatePages (layout estimate)', () => {
  it('fits roughly 40 to 46 single lines on a US Letter page with 1in margins', () => {
    expect(estimatePages(doc(Array.from({ length: 38 }, () => para(LINE)))).pages).toBe(1)
    expect(estimatePages(doc(Array.from({ length: 50 }, () => para(LINE)))).pages).toBe(2)
  })

  it('counts more pages when margins are wider', () => {
    const paras = Array.from({ length: 36 }, () => para(LINE))
    expect(estimatePages(doc(paras)).pages).toBe(1)
    const wide = { topPt: 144, bottomPt: 144, leftPt: 144, rightPt: 144 }
    expect(estimatePages(doc(paras, { margins: wide })).pages).toBeGreaterThan(1)
  })

  it('counts double-spaced text as taking about twice the room', () => {
    const single = Array.from({ length: 30 }, () => para(LINE))
    const double = Array.from({ length: 30 }, () => para(LINE, { lineSpacing: 200 }))
    expect(estimatePages(doc(single)).pages).toBe(1)
    expect(estimatePages(doc(double)).pages).toBe(2)
  })

  it('starts a new page after a page break', () => {
    expect(
      estimatePages(doc([para('a'), para('', { kind: 'pageBreak' }), para('b')])).pages,
    ).toBe(2)
  })

  it('moves an image that does not fit to the next page', () => {
    const text = Array.from({ length: 30 }, () => para(LINE))
    const image = para('', { images: [{ widthPt: 400, heightPt: 300 }] })
    expect(estimatePages(doc([...text, image])).pages).toBe(2)
  })

  it('sizes tables from their rows', () => {
    const small = para('', { kind: 'table', tableRows: [[5, 5]] })
    const big = para('', { kind: 'table', tableRows: Array.from({ length: 60 }, () => [20, 20]) })
    expect(estimatePages(doc([small])).pages).toBe(1)
    expect(estimatePages(doc([big])).pages).toBeGreaterThan(1)
  })

  it('locates an offset by its share of the laid-out height', () => {
    const d = doc(Array.from({ length: 10 }, (_, i) => para(`line ${i}`)))
    const loc = lineLocation(d, d.paragraphs[9].start!)
    expect(loc.fraction).toBeGreaterThan(0.8)
    expect(loc.page).toBe(0)
  })
})

describe('mapApiDoc layout fields', () => {
  it('reads line spacing, paragraph spacing and table cell sizes', () => {
    const d = mapApiDoc('id', {
      body: {
        content: [
          {
            startIndex: 1,
            endIndex: 7,
            paragraph: {
              elements: [{ startIndex: 1, textRun: { content: 'Hello\n' } }],
              paragraphStyle: { lineSpacing: 200, spaceAbove: { magnitude: 12 } },
            },
          },
          {
            startIndex: 7,
            endIndex: 20,
            table: {
              tableRows: [
                {
                  tableCells: [
                    { content: [{ paragraph: { elements: [{ textRun: { content: 'abc\n' } }] } }] },
                    { content: [{ paragraph: { elements: [{ textRun: { content: '\n' } }] } }] },
                  ],
                },
              ],
            },
          },
        ],
      },
    })
    expect(d.paragraphs[0].lineSpacing).toBe(200)
    expect(d.paragraphs[0].spaceAbovePt).toBe(12)
    expect(d.paragraphs[1].tableRows).toEqual([[3, 0]])
  })
})

describe('docIdFromUrl', () => {
  it('reads the id from Google Docs URLs, including multi-account ones', () => {
    expect(docIdFromUrl('https://docs.google.com/document/d/abc_123-X/edit')).toBe('abc_123-X')
    expect(docIdFromUrl('https://docs.google.com/document/u/1/d/xyz/edit#heading=h.1')).toBe('xyz')
  })

  it('rejects anything that is not a Google Doc', () => {
    expect(docIdFromUrl('https://docs.google.com/spreadsheets/d/abc/edit')).toBeNull()
    expect(docIdFromUrl('https://evil.example/https://docs.google.com/document/d/abc')).toBeNull()
    expect(docIdFromUrl(undefined)).toBeNull()
  })
})
