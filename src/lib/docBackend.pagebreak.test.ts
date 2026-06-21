import { describe, it, expect } from 'vitest'
import { buildRequests } from './docBackend'
import { rebuildOffsets, type DocModel } from './docModel'

// A page-break paragraph with Docs anchors: the break element + its newline span two indices.
const doc = (): DocModel =>
  rebuildOffsets({
    id: 'd',
    title: 't',
    defaultFontSize: 11,
    linesPerPage: 46,
    paragraphs: [
      { id: 'a', kind: 'normal', runs: [{ text: 'Intro', fontSize: 11 }], docStart: 1, docEnd: 7 },
      { id: 'pb', kind: 'pageBreak', runs: [{ text: '', fontSize: 11 }], docStart: 7, docEnd: 9 },
    ],
  })

describe('buildRequests: pageBreakToRule → horizontal line', () => {
  it('deletes the page break and borders the empty paragraph (no em-dash text)', () => {
    const d = doc()
    const reqs = buildRequests(d, {
      kind: 'pageBreakToRule',
      range: { start: d.paragraphs[1].start!, end: d.paragraphs[1].end! },
    }) as any[]

    // Drop the page-break content, keeping the trailing newline at docStart (7).
    expect(reqs[0]).toEqual({ deleteContentRange: { range: { startIndex: 7, endIndex: 8 } } })

    // Then turn the remaining empty paragraph into a horizontal line via a bottom border.
    const style = reqs[1].updateParagraphStyle
    expect(style.range).toEqual({ startIndex: 7, endIndex: 8 })
    expect(style.fields).toBe('borderBottom,indentStart,indentEnd,indentFirstLine')
    expect(style.paragraphStyle.borderBottom.dashStyle).toBe('SOLID')
    expect(style.paragraphStyle.borderBottom.width).toEqual({ magnitude: 1, unit: 'PT' })

    // Indents zeroed so the (dynamic) border spans the full text column, margin to margin.
    expect(style.paragraphStyle.indentStart).toEqual({ magnitude: 0, unit: 'PT' })
    expect(style.paragraphStyle.indentEnd).toEqual({ magnitude: 0, unit: 'PT' })

    // No literal "— — —" rule text is inserted anymore.
    expect(JSON.stringify(reqs)).not.toContain('insertText')
  })
})

describe('buildRequests: reduceIndents → updateParagraphStyle', () => {
  it('zeroes only the wide side(s) of each wide paragraph in range', () => {
    const d = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: [
        // wide left + narrow right → only indentStart should be zeroed
        { id: 'a', kind: 'normal', runs: [{ text: 'Indented para', fontSize: 11 }], indentStartPt: 144, indentEndPt: 18, docStart: 1, docEnd: 15 },
        // small indent → not touched
        { id: 'b', kind: 'normal', runs: [{ text: 'Normal para', fontSize: 11 }], indentStartPt: 18, docStart: 15, docEnd: 27 },
      ],
    })
    const reqs = buildRequests(d, {
      kind: 'reduceIndents',
      range: { start: d.paragraphs[0].start!, end: d.paragraphs[1].end! },
    }) as any[]

    // Only the wide paragraph produces a request.
    expect(reqs).toHaveLength(1)
    const u = reqs[0].updateParagraphStyle
    expect(u.fields).toBe('indentStart') // narrow right side left out
    expect(u.paragraphStyle.indentStart).toEqual({ magnitude: 0, unit: 'PT' })
    expect(u.paragraphStyle.indentEnd).toBeUndefined()
    expect(u.range.startIndex).toBe(1)
  })
})

describe('buildRequests: setMargins → updateDocumentStyle', () => {
  it('updates the four document margins in points', () => {
    const reqs = buildRequests(doc(), {
      kind: 'setMargins',
      range: { start: 0, end: 0 },
      topPt: 54,
      bottomPt: 54,
      leftPt: 54,
      rightPt: 54,
    }) as any[]

    expect(reqs).toHaveLength(1)
    const u = reqs[0].updateDocumentStyle
    expect(u.fields).toBe('marginTop,marginBottom,marginLeft,marginRight')
    expect(u.documentStyle.marginTop).toEqual({ magnitude: 54, unit: 'PT' })
    expect(u.documentStyle.marginRight).toEqual({ magnitude: 54, unit: 'PT' })
  })
})
