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
    expect(style.fields).toBe('borderBottom')
    expect(style.paragraphStyle.borderBottom.dashStyle).toBe('SOLID')
    expect(style.paragraphStyle.borderBottom.width).toEqual({ magnitude: 1, unit: 'PT' })

    // No literal "— — —" rule text is inserted anymore.
    expect(JSON.stringify(reqs)).not.toContain('insertText')
  })
})
