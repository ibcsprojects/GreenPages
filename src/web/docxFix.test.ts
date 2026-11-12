import { describe, expect, it } from 'vitest'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { DocxError, DocxSession } from './docxFix'
import type { XmlImpl } from '../lib/ooxml/ooxml'

const impl = { DOMParser, XMLSerializer } as unknown as XmlImpl
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const p = (t: string, rPr = '') => `<w:p><w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t>${t}</w:t></w:r></w:p>`

function makeDocx(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    '_rels/.rels': strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="2880" w:right="2880" w:bottom="2880" w:left="2880"/></w:sectPr></w:body></w:document>`),
    'word/media/keep.bin': new Uint8Array([1, 2, 3]),
  })
}

describe('DocxSession', () => {
  it('finds issues, applies all, and exports a valid copy that keeps other parts', async () => {
    const s = DocxSession.open(
      makeDocx(p('Key result', '<w:highlight w:val="yellow"/>') + '<w:p/><w:p/><w:p/>' + p('End')),
      'report.docx',
      impl,
    )
    expect(s.flags.length).toBeGreaterThan(1)
    await s.applyAll()
    expect(s.flags).toEqual([])
    expect(s.appliedCount).toBeGreaterThan(1)

    const out = s.export()
    const files = unzipSync(out)
    expect(Object.keys(files)).toContain('word/media/keep.bin')
    expect([...files['word/media/keep.bin']]).toEqual([1, 2, 3])
    expect(strFromU8(files['word/document.xml'])).toContain('Key result')

    // The copy opens again and is clean.
    const again = DocxSession.open(out, 'report (fixed).docx', impl)
    expect(again.flags).toEqual([])
  })

  it('applies one fix at a time', async () => {
    const s = DocxSession.open(makeDocx(p('Marked', '<w:highlight w:val="yellow"/>')), 'a.docx', impl)
    const highlight = s.flags.find((f) => f.type === 'highlight')!
    await s.apply(highlight.id)
    expect(s.flags.find((f) => f.type === 'highlight')).toBeUndefined()
    expect(s.appliedCount).toBe(1)
  })

  it('explains a file that is not a docx', () => {
    expect(() => DocxSession.open(strToU8('not a zip'), 'x.docx', impl)).toThrow(DocxError)
    expect(() => DocxSession.open(zipSync({ 'a.txt': strToU8('hi') }), 'x.docx', impl)).toThrow(/no document body/)
  })
})
