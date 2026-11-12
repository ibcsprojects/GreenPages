import { describe, expect, it } from 'vitest'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { OoxmlDoc, type XmlImpl } from '../lib/ooxml/ooxml'
import { analyzeDoc } from '../lib/analyzer/rules'
import { parseFlatOpc } from './flatOpc'
import { alignParagraphs, planAction, type WordPara } from './plan'

const impl = { DOMParser, XMLSerializer } as unknown as XmlImpl
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
const r = (t: string, rp = '') => `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ''}<w:t>${t}</w:t></w:r>`
const p = (inner: string, pp = '') => `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ''}${inner}</w:p>`
const doc = (body: string) => new OoxmlDoc(`<w:document ${NS}><w:body>${body}</w:body></w:document>`, impl)
const wordOf = (d: OoxmlDoc): WordPara[] => d.model.paragraphs.map((x) => ({ text: x.runs.map((q) => q.text).join(''), nesting: 0 }))

describe('flat OPC', () => {
  it('extracts the document and styles parts', () => {
    const xml = `<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">
      <pkg:part pkg:name="/word/styles.xml"><pkg:xmlData><w:styles ${NS}/></pkg:xmlData></pkg:part>
      <pkg:part pkg:name="/word/document.xml"><pkg:xmlData><w:document ${NS}><w:body/></w:document></pkg:xmlData></pkg:part></pkg:package>`
    const out = parseFlatOpc(xml, impl)
    expect(out.documentXml).toContain('w:document')
    expect(out.stylesXml).toContain('w:styles')
    expect(() => parseFlatOpc('<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"/>', impl)).toThrow()
  })
})

describe('alignParagraphs', () => {
  it('pairs paragraphs, skipping tables and their inner paragraphs', () => {
    const d = doc(p(r('One')) + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' + p(r('Two')))
    const word: WordPara[] = [
      { text: 'One', nesting: 0 },
      { text: 'cell', nesting: 1 },
      { text: 'Two', nesting: 0 },
    ]
    const a = alignParagraphs(d.model, d.topLevel(), word)
    expect(a).toEqual({ ok: true, wordIndex: [0, null, 2] })
  })

  it('refuses on any doubt: different text, different count, content controls', () => {
    const d = doc(p(r('One')) + p(r('Two')))
    expect(alignParagraphs(d.model, d.topLevel(), [{ text: 'One', nesting: 0 }, { text: 'Changed', nesting: 0 }]).ok).toBe(false)
    expect(alignParagraphs(d.model, d.topLevel(), [{ text: 'One', nesting: 0 }]).ok).toBe(false)
    expect(alignParagraphs(d.model, d.topLevel(), [...wordOf(d), { text: 'extra', nesting: 0 }]).ok).toBe(false)
    const sdt = doc(p(r('One')) + '<w:sdt><w:sdtContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:sdtContent></w:sdt>')
    expect(alignParagraphs(sdt.model, sdt.topLevel(), wordOf(sdt)).ok).toBe(false)
  })
})

describe('planAction', () => {
  const plan = (body: string, type: string) => {
    const d = doc(body)
    const a = alignParagraphs(d.model, d.topLevel(), wordOf(d))
    if (!a.ok) throw new Error(a.reason)
    const flag = analyzeDoc(d.model).find((f) => f.type === type)!
    return planAction(flag.action, d.model, a.wordIndex)
  }

  it('deletes extra blank lines but keeps one', () => {
    const out = plan(p(r('a')) + '<w:p/><w:p/><w:p/>' + p(r('b')), 'doubleSpacing')
    expect(out).toEqual({ ok: true, ops: [{ op: 'deleteParagraph', at: 1 }, { op: 'deleteParagraph', at: 2 }] })
  })

  it('formats a fully highlighted paragraph, and refuses a partly highlighted one', () => {
    expect(plan(p(r('All marked', '<w:highlight w:val="yellow"/>')), 'highlight')).toMatchObject({
      ok: true,
      ops: [{ op: 'setFont', at: 0, clearHighlight: true }],
    })
    const partial = plan(p(r('Marked', '<w:highlight w:val="yellow"/>') + r(' plain text here')), 'highlight')
    expect(partial.ok).toBe(false)
  })

  it('changes oversized text only when the whole paragraph is covered', () => {
    expect(plan(p(r('Big '.repeat(80), '<w:sz w:val="40"/>')), 'fontSize')).toMatchObject({ ok: true, ops: [{ op: 'setFont', size: 11 }] })
  })

  it('leaves margins, page breaks and bullet tables to the file tool', () => {
    for (const k of ['pageBreakToRule', 'bulletsToTable', 'setMargins'] as const) {
      const action = { kind: k, range: { start: 0, end: 0 }, rows: [], topPt: 0, bottomPt: 0, leftPt: 0, rightPt: 0 } as never
      const d = doc(p(r('x')))
      expect(planAction(action, d.model, [0]).ok).toBe(false)
    }
  })
})
