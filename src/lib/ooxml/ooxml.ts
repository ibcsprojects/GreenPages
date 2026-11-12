// Reads and edits Word's document XML (WordprocessingML) with the same DocModel and
// EditActions the Google Docs adapter uses, so every GreenPages check works on Word files
// too. Two things use this: the browser tool that fixes a .docx file, and the Word add-in
// (Word hands the add-in the same XML).
//
// Rules this file follows so a fixed file still opens cleanly in Word:
//  - Edits change only what a fix needs. Everything the model doesn't understand (fields,
//    text boxes, footnotes, section breaks, shapes) is left byte-for-byte and treated as
//    "opaque": it is never counted as blank, never deleted.
//  - New XML elements go in the order Word's schema requires.

import {
  BULLET_GLYPH,
  hasWideIndent,
  rebuildOffsets,
  wideIndentSides,
  type DocImage,
  type DocModel,
  type Paragraph,
  type TextRun,
} from '../docModel'
import type { EditAction, Range } from '../analyzer/types'
import { tableLayout } from '../tableLayout'
import type { EditBackend } from '../docBackend'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const EMU_PER_PT = 12700
const TWIPS_PER_PT = 20
const WORD_DEFAULT_FONT = 11

/** The browser's DOMParser/XMLSerializer, or xmldom's in tests. */
export interface XmlImpl {
  DOMParser: new () => { parseFromString(xml: string, type: string): Document }
  XMLSerializer: new () => { serializeToString(node: Node): string }
}

export interface OoxmlOptions {
  id?: string
  title?: string
  /** From styles.xml: ids of heading/title styles, and the document's default font size. */
  styles?: StyleInfo
}

export interface StyleInfo {
  headingStyleIds: Set<string>
  defaultFontSizePt: number
}

// ---- schema order (Word rejects some files whose property elements are out of order) ----
const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath']
const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange']

// Content we never edit or count as blank.
const OPAQUE = new Set(['pict', 'object', 'footnoteReference', 'endnoteReference', 'fldChar', 'fldSimple', 'sym', 'commentReference', 'sdt', 'AlternateContent', 'anchor', 'txbxContent'])

// ---- small DOM helpers ----
const isW = (el: Element, name: string) => el.namespaceURI === W && el.localName === name

function childEls(el: Element): Element[] {
  const out: Element[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element)
  return out
}
const child = (el: Element | null | undefined, name: string): Element | null =>
  el ? (childEls(el).find((c) => isW(c, name)) ?? null) : null

function descendants(el: Element, pred: (e: Element) => boolean, out: Element[] = []): Element[] {
  for (const c of childEls(el)) {
    if (pred(c)) out.push(c)
    descendants(c, pred, out)
  }
  return out
}

function closestParagraph(node: Node): Element | null {
  for (let n: Node | null = node.parentNode; n; n = n.parentNode) {
    if (n.nodeType === 1 && isW(n as Element, 'p')) return n as Element
  }
  return null
}

const wattr = (el: Element | null | undefined, name: string): string | null =>
  el && el.hasAttributeNS(W, name) ? el.getAttributeNS(W, name) : null

const num = (v: string | null): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A Word on/off property (<w:b/>, <w:b w:val="0"/>). */
function isOn(el: Element | null): boolean {
  if (!el) return false
  const v = wattr(el, 'val')
  return !(v === '0' || v === 'false' || v === 'off')
}

function setChild(parent: Element, order: string[], name: string, attrs: Record<string, string> = {}): Element {
  let el = child(parent, name)
  if (!el) {
    el = parent.ownerDocument.createElementNS(W, `w:${name}`)
    const at = order.indexOf(name)
    const before = childEls(parent).find((c) => c.namespaceURI === W && order.indexOf(c.localName) > at)
    parent.insertBefore(el, before ?? null)
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttributeNS(W, `w:${k}`, v)
  return el
}

function removeChild(parent: Element | null, name: string): void {
  const el = child(parent, name)
  if (el && parent) parent.removeChild(el)
}

function getPPr(p: Element): Element {
  let pPr = child(p, 'pPr')
  if (!pPr) {
    pPr = p.ownerDocument.createElementNS(W, 'w:pPr')
    p.insertBefore(pPr, p.firstChild)
  }
  return pPr
}

function getRPr(r: Element): Element {
  let rPr = child(r, 'rPr')
  if (!rPr) {
    rPr = r.ownerDocument.createElementNS(W, 'w:rPr')
    r.insertBefore(rPr, r.firstChild)
  }
  return rPr
}

function runText(run: Element): string {
  let s = ''
  for (const c of childEls(run)) {
    if (isW(c, 't')) s += c.textContent ?? ''
    else if (isW(c, 'tab')) s += '\t'
    else if (isW(c, 'noBreakHyphen')) s += '-'
    else if (isW(c, 'br') && !['page', 'column'].includes(wattr(c, 'type') ?? '')) s += '\n'
  }
  return s
}

/** Heading style ids and the default font size, read from styles.xml. */
export function readStyleInfo(stylesXml: string, impl: XmlImpl): StyleInfo {
  const doc = new impl.DOMParser().parseFromString(stylesXml, 'application/xml')
  const root = doc.documentElement
  const headingStyleIds = new Set<string>()
  for (const s of descendants(root, (e) => isW(e, 'style'))) {
    const name = (wattr(child(s, 'name'), 'val') ?? '').toLowerCase()
    const id = wattr(s, 'styleId')
    if (id && (/^heading \d/.test(name) || name === 'title' || name === 'subtitle')) headingStyleIds.add(id)
  }
  const rPrDefault = descendants(root, (e) => isW(e, 'rPrDefault'))[0]
  const defSz = num(wattr(child(child(rPrDefault, 'rPr'), 'sz'), 'val'))
  return { headingStyleIds, defaultFontSizePt: defSz ? defSz / 2 : WORD_DEFAULT_FONT }
}

export class OoxmlDoc {
  private dom: Document
  private impl: XmlImpl
  private opts: OoxmlOptions
  private defaultFont: number
  private paraEls: (Element | null)[] = []
  private runEls: Element[][] = []
  private current!: DocModel

  constructor(xml: string, impl: XmlImpl, opts: OoxmlOptions = {}) {
    this.impl = impl
    this.opts = opts
    this.dom = new impl.DOMParser().parseFromString(xml, 'application/xml')
    this.defaultFont = opts.styles?.defaultFontSizePt ?? WORD_DEFAULT_FONT
    this.current = this.build()
  }

  get model(): DocModel {
    return this.current
  }

  serialize(): string {
    return new this.impl.XMLSerializer().serializeToString(this.dom)
  }

  // ------------------------------------------------------------------ read
  private body(): Element {
    const body = descendants(this.dom.documentElement, (e) => isW(e, 'body'))[0]
    if (!body) throw new Error('This file has no document body.')
    return body
  }

  private opaque(id: string): Paragraph {
    return { id, kind: 'table', runs: [{ text: '', fontSize: this.defaultFont }] }
  }

  private build(): DocModel {
    const body = this.body()
    this.paraEls = []
    this.runEls = []
    const paragraphs: Paragraph[] = []
    let i = 0
    const push = (p: Paragraph, el: Element | null, runs: Element[] = []) => {
      paragraphs.push(p)
      this.paraEls.push(el)
      this.runEls.push(runs)
    }
    for (const el of childEls(body)) {
      if (isW(el, 'sectPr')) continue
      if (isW(el, 'p')) {
        const pPr = child(el, 'pPr')
        if ((pPr && child(pPr, 'sectPr')) || this.hasOpaque(el)) push(this.opaque(`t${i++}`), el)
        else {
          const mapped = this.mapParagraph(`p${i++}`, el)
          push(mapped.paragraph, el, mapped.runEls)
        }
      } else if (isW(el, 'tbl')) {
        push(
          {
            id: `t${i++}`,
            kind: 'table',
            runs: [{ text: '', fontSize: this.defaultFont }],
            tableRows: childEls(el)
              .filter((r) => isW(r, 'tr'))
              .map((r) =>
                childEls(r)
                  .filter((c) => isW(c, 'tc'))
                  .map((c) => descendants(c, (e) => isW(e, 't')).reduce((n, t) => n + (t.textContent ?? '').length, 0)),
              ),
          },
          el,
        )
      } else push(this.opaque(`t${i++}`), el)
    }
    if (paragraphs.length === 0) push({ id: 'p0', kind: 'normal', runs: [{ text: '', fontSize: this.defaultFont }] }, null)

    const sect = [...childEls(body)].reverse().find((e) => isW(e, 'sectPr')) ?? null
    const pgSz = child(sect, 'pgSz')
    const pgMar = child(sect, 'pgMar')
    const tw = (el: Element | null, name: string, dflt: number) => (num(wattr(el, name)) ?? dflt) / TWIPS_PER_PT
    return rebuildOffsets({
      id: this.opts.id ?? 'docx',
      title: this.opts.title ?? 'Document',
      defaultFontSize: this.defaultFont,
      linesPerPage: 46,
      paragraphs,
      pageWidthPt: tw(pgSz, 'w', 12240),
      pageHeightPt: tw(pgSz, 'h', 15840),
      margins: {
        topPt: tw(pgMar, 'top', 1440),
        bottomPt: tw(pgMar, 'bottom', 1440),
        leftPt: tw(pgMar, 'left', 1440),
        rightPt: tw(pgMar, 'right', 1440),
      },
    })
  }

  private hasOpaque(p: Element): boolean {
    return descendants(p, (e) => OPAQUE.has(e.localName)).length > 0
  }

  private mapParagraph(id: string, el: Element): { paragraph: Paragraph; runEls: Element[] } {
    const pPr = child(el, 'pPr')
    const runEls = descendants(el, (e) => isW(e, 'r') && closestParagraph(e) === el && runText(e).length > 0)
    const runs: TextRun[] = runEls.map((r) => this.mapRun(r))
    const images = this.mapImages(el)
    if (runs.length === 0) runs.push({ text: '', fontSize: this.defaultFont })
    const text = runs.map((r) => r.text).join('')

    const hasPageBreak = descendants(el, (e) => isW(e, 'br') && wattr(e, 'type') === 'page').length > 0
    const styleId = wattr(child(pPr, 'pStyle'), 'val')
    const isHeading = !!styleId && (this.opts.styles?.headingStyleIds.has(styleId) ?? /^(Heading\d|Title)/i.test(styleId))
    // A page break that shares a paragraph with text is left alone: the fix would drop the text.
    const kind: Paragraph['kind'] =
      hasPageBreak && text.trim() === ''
        ? 'pageBreak'
        : child(pPr, 'numPr') || BULLET_GLYPH.test(text)
          ? 'bullet'
          : isHeading
            ? 'heading'
            : 'normal'

    const ind = child(pPr, 'ind')
    const left = num(wattr(ind, 'left') ?? wattr(ind, 'start'))
    const right = num(wattr(ind, 'right') ?? wattr(ind, 'end'))
    const spacing = child(pPr, 'spacing')
    const line = num(wattr(spacing, 'line'))
    const lineRule = wattr(spacing, 'lineRule')
    const before = num(wattr(spacing, 'before'))
    const after = num(wattr(spacing, 'after'))
    const bottom = child(child(pPr, 'pBdr'), 'bottom')
    const isRule = !!bottom && !['nil', 'none'].includes(wattr(bottom, 'val') ?? '') && text.trim() === ''

    const paragraph: Paragraph = {
      id,
      kind,
      runs,
      ...(images.length ? { images } : {}),
      ...(left ? { indentStartPt: left / TWIPS_PER_PT } : {}),
      ...(right ? { indentEndPt: right / TWIPS_PER_PT } : {}),
      ...(isRule ? { isRule: true } : {}),
      ...(line && (!lineRule || lineRule === 'auto') ? { lineSpacing: Math.round((line / 240) * 100) } : {}),
      ...(before != null ? { spaceAbovePt: before / TWIPS_PER_PT } : {}),
      ...(after != null ? { spaceBelowPt: after / TWIPS_PER_PT } : {}),
    }
    return { paragraph, runEls: runs[0].text === '' && runEls.length === 0 ? [] : runEls }
  }

  private mapRun(r: Element): TextRun {
    const rPr = child(r, 'rPr')
    const hl = wattr(child(rPr, 'highlight'), 'val')
    const fill = wattr(child(rPr, 'shd'), 'fill')
    const highlightColor = hl && hl !== 'none' ? hl : fill && !/^(auto|ffffff)$/i.test(fill) ? `#${fill}` : null
    const sz = num(wattr(child(rPr, 'sz'), 'val'))
    const u = child(rPr, 'u')
    return {
      text: runText(r),
      fontSize: sz ? sz / 2 : this.defaultFont,
      ...(isOn(child(rPr, 'b')) ? { bold: true } : {}),
      ...(isOn(child(rPr, 'i')) ? { italic: true } : {}),
      ...(u && wattr(u, 'val') !== 'none' ? { underline: true } : {}),
      highlightColor,
    }
  }

  private inlineDrawings(p: Element): Element[] {
    return descendants(p, (e) => e.namespaceURI === WP && e.localName === 'inline' && closestParagraph(e) === p)
  }

  private mapImages(p: Element): DocImage[] {
    return this.inlineDrawings(p).map((inline, k) => {
      const extent = childEls(inline).find((c) => c.namespaceURI === WP && c.localName === 'extent')
      const docPr = childEls(inline).find((c) => c.namespaceURI === WP && c.localName === 'docPr')
      return {
        objectId: `${docPr?.getAttribute('id') ?? 'img'}-${k}`,
        widthPt: (num(extent?.getAttribute('cx') ?? null) ?? 0) / EMU_PER_PT,
        heightPt: (num(extent?.getAttribute('cy') ?? null) ?? 0) / EMU_PER_PT,
      }
    })
  }

  // ----------------------------------------------------------------- write
  /** Apply one accepted fix, then re-read the model so offsets stay correct. */
  apply(action: EditAction): DocModel {
    const m = this.current
    const within = (a: Range, b: { start?: number; end?: number }) => b.start! >= a.start && b.end! <= a.end
    const overlaps = (a: Range, b: { start?: number; end?: number }) => b.start! < a.end && b.end! > a.start
    const idx = (pred: (p: Paragraph) => boolean) => m.paragraphs.map((p, k) => (pred(p) ? k : -1)).filter((k) => k >= 0)

    switch (action.kind) {
      case 'removeHighlight':
        this.forRuns(action.range, (r) => {
          const rPr = getRPr(r)
          removeChild(rPr, 'highlight')
          removeChild(rPr, 'shd')
          if (action.alt === 'underline') setChild(rPr, RPR_ORDER, 'u', { val: 'single' })
          else setChild(rPr, RPR_ORDER, 'i').removeAttributeNS(W, 'val')
        })
        break

      case 'setFontSize':
        this.forRuns(action.range, (r) => {
          const rPr = getRPr(r)
          setChild(rPr, RPR_ORDER, 'sz', { val: String(Math.round(action.to * 2)) })
          setChild(rPr, RPR_ORDER, 'szCs', { val: String(Math.round(action.to * 2)) })
        })
        break

      case 'removeBlankLines': {
        const blanks = idx(
          (p) => within(action.range, p) && p.kind !== 'pageBreak' && p.kind !== 'table' && !p.isRule && !p.images?.length,
        )
        if (blanks.length === 0) break
        const last = blanks[blanks.length - 1]
        const before = m.paragraphs[blanks[0] - 1]
        const trailing = last === m.paragraphs.length - 1
        // Same rule as the Google adapter: a trailing run after normal content goes entirely;
        // a mid-document run keeps one blank line.
        const drop = trailing && before && before.kind !== 'table' ? blanks : blanks.slice(0, -1)
        for (const k of drop) this.detach(this.paraEls[k])
        break
      }

      case 'pageBreakToRule': {
        const [k] = idx((p) => within(action.range, p) && p.kind === 'pageBreak')
        const p = k != null ? this.paraEls[k] : null
        if (!p) break
        for (const br of descendants(p, (e) => isW(e, 'br') && wattr(e, 'type') === 'page')) {
          const run = br.parentNode as Element
          run.removeChild(br)
          if (childEls(run).every((c) => isW(c, 'rPr'))) run.parentNode?.removeChild(run)
        }
        const pPr = getPPr(p)
        removeChild(pPr, 'pageBreakBefore')
        removeChild(pPr, 'ind')
        const bdr = setChild(pPr, PPR_ORDER, 'pBdr')
        const bottom = child(bdr, 'bottom') ?? bdr.appendChild(p.ownerDocument.createElementNS(W, 'w:bottom'))
        for (const [a, v] of Object.entries({ val: 'single', sz: '6', space: '1', color: 'A6A6A6' })) {
          (bottom as Element).setAttributeNS(W, `w:${a}`, v)
        }
        break
      }

      case 'bulletsToTable': {
        const bullets = idx((p) => overlaps(action.range, p) && p.kind === 'bullet')
        if (bullets.length === 0) break
        const first = bullets[0]
        const last = bullets[bullets.length - 1]
        const span = m.paragraphs.slice(first, last + 1)
        // Never swallow something we can't model (a table, field, text box) lying between.
        if (span.some((p) => p.kind === 'table')) break
        const anchor = this.paraEls[first]
        if (!anchor?.parentNode) break
        const table = this.buildTable(action.rows, m)
        anchor.parentNode.insertBefore(table, anchor)
        for (let k = first; k <= last; k++) this.detach(this.paraEls[k])
        this.padAroundTable(table)
        break
      }

      case 'replaceText': {
        const [k] = idx((p) => overlaps(action.range, p))
        const runs = k != null ? this.runEls[k] : []
        if (!runs.length) break
        runs.forEach((run, n) => {
          for (const c of childEls(run)) if (isW(c, 't') || isW(c, 'tab') || (isW(c, 'br') && !wattr(c, 'type'))) run.removeChild(c)
          if (n === 0) {
            const t = run.ownerDocument.createElementNS(W, 'w:t')
            t.setAttributeNS(XML_NS, 'xml:space', 'preserve')
            t.appendChild(run.ownerDocument.createTextNode(action.text))
            run.appendChild(t)
          } else if (childEls(run).every((c) => isW(c, 'rPr'))) run.parentNode?.removeChild(run)
        })
        break
      }

      case 'setMargins': {
        const sect = [...childEls(this.body())].reverse().find((e) => isW(e, 'sectPr'))
        if (!sect) break
        let mar = child(sect, 'pgMar')
        if (!mar) {
          mar = this.dom.createElementNS(W, 'w:pgMar')
          const sz = child(sect, 'pgSz')
          sect.insertBefore(mar, sz ? sz.nextSibling : sect.firstChild)
        }
        const set: Record<string, number> = { top: action.topPt, bottom: action.bottomPt, left: action.leftPt, right: action.rightPt }
        for (const [side, pt] of Object.entries(set)) mar.setAttributeNS(W, `w:${side}`, String(Math.round(pt * TWIPS_PER_PT)))
        break
      }

      case 'reduceIndents':
        m.paragraphs.forEach((p, k) => {
          const el = this.paraEls[k]
          if (!el || !overlaps(action.range, p) || !hasWideIndent(p)) return
          const ind = child(child(el, 'pPr'), 'ind')
          if (!ind) return
          const s = wideIndentSides(p)
          const zero = (names: string[]) => names.forEach((n) => ind.hasAttributeNS(W, n) && ind.setAttributeNS(W, `w:${n}`, '0'))
          if (s.left) zero(['left', 'start'])
          if (s.right) zero(['right', 'end'])
        })
        break

      case 'resizeImage':
        m.paragraphs.forEach((p, k) => {
          const el = this.paraEls[k]
          if (!el || !p.images) return
          if (!action.objectId && !within(action.range, p)) return
          this.inlineDrawings(el).forEach((inline, n) => {
            if (action.objectId && p.images![n]?.objectId !== action.objectId) return
            const scale = (v: string | null) => String(Math.round((num(v) ?? 0) * action.scale))
            const extent = childEls(inline).find((c) => c.namespaceURI === WP && c.localName === 'extent')
            for (const e of [extent, ...descendants(inline, (x) => x.namespaceURI === A && x.localName === 'ext' && x.hasAttribute('cx'))]) {
              if (!e) continue
              e.setAttribute('cx', scale(e.getAttribute('cx')))
              e.setAttribute('cy', scale(e.getAttribute('cy')))
            }
          })
        })
        break
    }
    this.current = this.build()
    return this.current
  }

  private forRuns(range: Range, fn: (run: Element) => void): void {
    this.current.paragraphs.forEach((p, k) => {
      if (!(p.start! < range.end && p.end! > range.start)) return
      p.runs.forEach((r, n) => {
        const el = this.runEls[k][n]
        if (el && r.start! < range.end && r.end! > range.start) fn(el)
      })
    })
  }

  private detach(el: Element | null): void {
    el?.parentNode?.removeChild(el)
  }

  private buildTable(rows: string[], m: DocModel): Element {
    const doc = this.dom
    const layout = tableLayout(rows)
    const make = (name: string, attrs: Record<string, string> = {}) => {
      const e = doc.createElementNS(W, `w:${name}`)
      for (const [k, v] of Object.entries(attrs)) e.setAttributeNS(W, `w:${k}`, v)
      return e
    }
    const textWidth = Math.round(((m.pageWidthPt ?? 612) - (m.margins?.leftPt ?? 72) - (m.margins?.rightPt ?? 72)) * TWIPS_PER_PT)
    const colWidth = Math.floor(textWidth / layout.columns)
    const tbl = make('tbl')
    const tblPr = tbl.appendChild(make('tblPr'))
    tblPr.appendChild(make('tblW', { w: String(colWidth * layout.columns), type: 'dxa' }))
    const borders = tblPr.appendChild(make('tblBorders'))
    for (const side of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
      borders.appendChild(make(side, { val: 'single', sz: '4', space: '0', color: 'BFBFBF' }))
    }
    tblPr.appendChild(make('tblLayout', { type: 'fixed' }))
    const grid = tbl.appendChild(make('tblGrid'))
    for (let c = 0; c < layout.columns; c++) grid.appendChild(make('gridCol', { w: String(colWidth) }))
    for (let r = 0; r < layout.rows; r++) {
      const tr = tbl.appendChild(make('tr'))
      for (let c = 0; c < layout.columns; c++) {
        const tc = tr.appendChild(make('tc'))
        tc.appendChild(make('tcPr')).appendChild(make('tcW', { w: String(colWidth), type: 'dxa' }))
        const p = tc.appendChild(make('p'))
        const text = layout.cells[r * layout.columns + c]
        if (text) {
          const t = p.appendChild(make('r')).appendChild(make('t'))
          t.setAttributeNS(XML_NS, 'xml:space', 'preserve')
          t.appendChild(doc.createTextNode(text))
        }
      }
    }
    return tbl
  }

  /** Word needs a paragraph between two tables and after a table that ends the body. */
  private padAroundTable(table: Element): void {
    const empty = () => this.dom.createElementNS(W, 'w:p')
    let after: Node | null = table.nextSibling
    while (after && after.nodeType !== 1) after = after.nextSibling
    if (!after || !isW(after as Element, 'p')) table.parentNode!.insertBefore(empty(), after)
    let before: Node | null = table.previousSibling
    while (before && before.nodeType !== 1) before = before.previousSibling
    if (before && isW(before as Element, 'tbl')) table.parentNode!.insertBefore(empty(), table)
  }
}

/** Plugs an OoxmlDoc into the same seam as the Google Docs backend. */
export class OoxmlBackend implements EditBackend {
  constructor(private readonly docx: OoxmlDoc) {}
  async apply(_doc: DocModel, action: EditAction): Promise<DocModel> {
    return this.docx.apply(action)
  }
}
