import { describe, expect, it } from 'vitest'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { OoxmlBackend, OoxmlDoc, readStyleInfo, type XmlImpl } from './ooxml'
import { analyzeDoc } from '../analyzer/rules'
import { applyAllFixes } from '../applyAll'
import { flatten } from '../docModel'

const impl = { DOMParser, XMLSerializer } as unknown as XmlImpl
const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'

const run = (text: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`
const para = (inner: string, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`
const blank = () => '<w:p/>'
const pageBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
const sect = (mar = 'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"') =>
  `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ${mar} w:header="720" w:footer="720"/></w:sectPr>`
const image = (cx: number, cy: number) =>
  `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="7" name="pic"/>` +
  `<a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:spPr><a:xfrm><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}</w:body></w:document>`
const open = (body: string) => new OoxmlDoc(xml(body), impl)
const backend = (d: OoxmlDoc) => new OoxmlBackend(d)

describe('reading a Word document', () => {
  it('maps text, formatting, kinds, margins and page size', () => {
    const d = open(
      para(run('Title', ''), '<w:pStyle w:val="Heading1"/>') +
        para(run('Marked', '<w:highlight w:val="yellow"/><w:sz w:val="36"/>')) +
        para(run('item'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') +
        pageBreak() +
        blank() +
        sect('w:top="2160" w:right="2160" w:bottom="2160" w:left="2160"'),
    )
    const m = d.model
    expect(m.paragraphs.map((p) => p.kind)).toEqual(['heading', 'normal', 'bullet', 'pageBreak', 'normal'])
    expect(m.paragraphs[1].runs[0]).toMatchObject({ text: 'Marked', fontSize: 18, highlightColor: 'yellow' })
    expect(m.margins).toEqual({ topPt: 108, bottomPt: 108, leftPt: 108, rightPt: 108 })
    expect(m.pageWidthPt).toBe(612)
    expect(flatten(m)).toBe('Title\nMarked\nitem\n\n')
  })

  it('treats fields, section breaks and tables as untouchable, never blank', () => {
    const d = open(
      para(`<w:r><w:fldChar w:fldCharType="begin"/></w:r>`) +
        para('', sect()) +
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>abc</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
        sect(),
    )
    expect(d.model.paragraphs.map((p) => p.kind)).toEqual(['table', 'table', 'table'])
    expect(d.model.paragraphs[2].tableRows).toEqual([[3]])
  })

  it('reads heading styles and the default size from styles.xml', () => {
    const styles = readStyleInfo(
      `<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>` +
        `<w:style w:styleId="Rubrik1"><w:name w:val="heading 1"/></w:style></w:styles>`,
      impl,
    )
    const d = new OoxmlDoc(xml(para(run('Hej'), '<w:pStyle w:val="Rubrik1"/>') + para(run('x'))), impl, { styles })
    expect(d.model.paragraphs[0].kind).toBe('heading')
    expect(d.model.defaultFontSize).toBe(12)
  })
})

describe('applying fixes to the XML', () => {
  it('removeHighlight swaps the fill for an underline, in schema order', async () => {
    const d = open(para(run('Marked', '<w:sz w:val="22"/><w:highlight w:val="yellow"/>')) + sect())
    const flag = analyzeDoc(d.model).find((f) => f.type === 'highlight')!
    await backend(d).apply(d.model, flag.action)
    const out = d.serialize()
    expect(out).not.toContain('w:highlight')
    expect(out).toMatch(/<w:sz [^>]*\/><w:szCs[^>]*\/>?|<w:sz [^>]*\/><w:u /)
    expect(out.indexOf('<w:sz ')).toBeLessThan(out.indexOf('<w:u '))
    expect(d.model.paragraphs[0].runs[0].underline).toBe(true)
  })

  it('setFontSize writes half-points', async () => {
    const d = open(para(run('Big text '.repeat(30), '<w:sz w:val="40"/>')) + sect())
    const flag = analyzeDoc(d.model).find((f) => f.type === 'fontSize')!
    await backend(d).apply(d.model, flag.action)
    expect(d.model.paragraphs[0].runs[0].fontSize).toBeLessThan(20)
    expect(d.serialize()).toMatch(/w:sz w:val="(22|24)"/)
  })

  it('removeBlankLines keeps one mid-document blank and protects section breaks', async () => {
    const d = open(para(run('a')) + blank() + blank() + blank() + para(run('b')) + para('', sect()) + sect())
    const flag = analyzeDoc(d.model).find((f) => f.type === 'doubleSpacing')!
    await backend(d).apply(d.model, flag.action)
    expect(d.model.paragraphs.map((p) => p.kind)).toEqual(['normal', 'normal', 'normal', 'table'])
    expect(d.serialize()).toContain('w:sectPr')
  })

  it('pageBreakToRule replaces a break with a bottom border', async () => {
    const d = open(para(run('before')) + pageBreak() + para(run('after')) + sect())
    const flag = analyzeDoc(d.model).find((f) => f.type === 'pageBreak')!
    await backend(d).apply(d.model, flag.action)
    expect(d.serialize()).not.toContain('w:type="page"')
    expect(d.model.paragraphs[1].isRule).toBe(true)
  })

  it('bulletsToTable builds a valid table and a paragraph after it', async () => {
    const bullets = Array.from({ length: 8 }, (_, i) =>
      para(run(`Item ${i}`), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    ).join('')
    const d = open(para(run('Intro')) + bullets + sect())
    const flag = analyzeDoc(d.model).find((f) => f.type === 'bulletSprawl')!
    await backend(d).apply(d.model, flag.action)
    const out = d.serialize()
    expect(out).toContain('<w:tbl>')
    expect(out).toContain('Item 7')
    expect(out).not.toContain('<w:numPr>')
    // The body must not end with the table: Word needs a closing paragraph.
    expect(out.indexOf('</w:tbl>')).toBeLessThan(out.lastIndexOf('<w:p'))
  })

  it('replaceText rewrites the paragraph into its first run', async () => {
    const d = open(para(run('In order to ') + run('proceed, ', '<w:b/>') + run('go.')) + sect())
    await backend(d).apply(d.model, {
      kind: 'replaceText',
      range: { start: 0, end: d.model.paragraphs[0].end! },
      text: 'To proceed, go.',
    })
    expect(flatten(d.model)).toBe('To proceed, go.')
    expect(d.model.paragraphs[0].runs).toHaveLength(1)
  })

  it('setMargins edits only the margin values', async () => {
    const d = open(para(run('x')) + sect('w:top="2880" w:right="2880" w:bottom="2880" w:left="2880"'))
    await backend(d).apply(d.model, { kind: 'setMargins', range: { start: 0, end: 0 }, topPt: 72, bottomPt: 72, leftPt: 72, rightPt: 72 })
    expect(d.model.margins).toEqual({ topPt: 72, bottomPt: 72, leftPt: 72, rightPt: 72 })
    expect(d.serialize()).toContain('w:header="720"')
  })

  it('resizeImage scales both extents together', async () => {
    const d = open(image(5_715_000, 4_286_250) + sect())
    const flag = analyzeDoc(d.model).find((f) => f.type === 'largeImage')!
    await backend(d).apply(d.model, flag.action)
    const img = d.model.paragraphs[0].images![0]
    expect(img.widthPt).toBeLessThan(450)
    expect(d.serialize().match(/cx="(\d+)"/g)!.every((c, _i, all) => c === all[0])).toBe(true)
  })
})

describe('end to end', () => {
  it('Apply all clears every flag on a wasteful document and keeps the text', async () => {
    const d = open(
      para(run('Report', ''), '<w:pStyle w:val="Heading1"/>') +
        para(run('Key result', '<w:highlight w:val="yellow"/>')) +
        para(run('In order to make a decision due to the fact that costs rose, we met. '.repeat(3))) +
        blank() + blank() + blank() + pageBreak() +
        para(run('End')) + blank() + blank() +
        sect('w:top="2880" w:right="2880" w:bottom="2880" w:left="2880"'),
    )
    expect(analyzeDoc(d.model).length).toBeGreaterThan(2)
    const result = await applyAllFixes(d.model, async (m) => analyzeDoc(m), (m, a) => backend(d).apply(m, a))
    expect(result.flags).toEqual([])
    expect(flatten(d.model)).toContain('Key result')
    expect(flatten(d.model)).toContain('End')
    // The result is still well-formed XML.
    expect(() => new DOMParser().parseFromString(d.serialize(), 'application/xml')).not.toThrow()
  })
})
