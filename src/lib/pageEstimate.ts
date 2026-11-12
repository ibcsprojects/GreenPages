// Estimates how many printed pages a DocModel will produce, without any Drive access.
// Used as the fallback page count (labelled "estimate" in the UI) whenever the exact
// count from Docs' own PDF export isn't available.
//
// It lays the document out the way Docs does, in points: the printable area comes from the
// real page size and margins, each paragraph's width from its indents, its line height from
// its font size and line spacing, plus heading spacing, image heights and table rows. Text
// may split across pages; images and table rows move to the next page whole, as in Docs.

import type { DocModel, Paragraph } from './docModel.js'
import { paragraphText } from './docModel.js'

const LETTER_W_PT = 612
const DEFAULT_MARGIN_PT = 72
/** Line box of a typical body font (Arial / Calibri ascent + descent), in ems. */
const FONT_LINE_EM = 1.15
/** Google Docs' default line spacing for Normal text ("1.15"). */
const DEFAULT_LINE_SPACING = 1.15
/** Average glyph advance of body text, in ems (Arial prose is roughly 0.47 to 0.5). */
const AVG_CHAR_EM = 0.48
/** Extra left inset a list item gets for its glyph when no explicit indent is set. */
const BULLET_INSET_PT = 18
/** Google Docs table cell padding (top + bottom) and border, in points. */
const CELL_PAD_PT = 10 + 1
const EPS = 0.01

export interface PageEstimate {
  pages: number
  /** Total height expressed in default body lines (for impact maths). */
  lines: number
  /** How many default body lines fit on one page. */
  linesPerPage: number
}

interface Geometry {
  contentW: number
  contentH: number
  defaultLineH: number
}

const lineHeight = (fontSize: number, spacing = DEFAULT_LINE_SPACING) =>
  fontSize * FONT_LINE_EM * spacing

function geometry(doc: DocModel): Geometry {
  const defaultLineH = lineHeight(doc.defaultFontSize)
  const pageW = doc.pageWidthPt ?? LETTER_W_PT
  const m = doc.margins
  const contentW = Math.max(
    72,
    pageW - (m?.leftPt ?? DEFAULT_MARGIN_PT) - (m?.rightPt ?? DEFAULT_MARGIN_PT),
  )
  // A doc that carries real page geometry (any live Google Doc) is laid out from it. Docs
  // without it (hand-built test fixtures) keep their declared lines-per-page.
  const contentH =
    doc.pageHeightPt != null || m
      ? Math.max(
          72,
          (doc.pageHeightPt ?? 792) - (m?.topPt ?? DEFAULT_MARGIN_PT) - (m?.bottomPt ?? DEFAULT_MARGIN_PT),
        )
      : doc.linesPerPage * defaultLineH
  return { contentW, contentH, defaultLineH }
}

/** Wrapped line count for `chars` characters at `fontSize` in a column `widthPt` wide. */
function wrappedLines(chars: number, fontSize: number, widthPt: number): number {
  const perLine = Math.max(8, widthPt / (fontSize * AVG_CHAR_EM))
  return Math.max(1, Math.ceil(chars / perLine))
}

/** A paragraph broken into layout pieces: splittable text lines, or unbreakable boxes. */
type Piece = { kind: 'line' | 'box'; h: number }

function pieces(p: Paragraph, doc: DocModel, g: Geometry): Piece[] {
  const out: Piece[] = []
  const text = paragraphText(p)
  const fontSize = Math.max(
    doc.defaultFontSize,
    ...p.runs.filter((r) => r.text.trim()).map((r) => r.fontSize),
  )
  const spacing = p.lineSpacing ? p.lineSpacing / 100 : DEFAULT_LINE_SPACING
  const lh = lineHeight(fontSize, spacing)

  // Headings carry Docs' default space above/below; any paragraph may set its own.
  const above = p.spaceAbovePt ?? (p.kind === 'heading' ? fontSize : 0)
  const below = p.spaceBelowPt ?? (p.kind === 'heading' ? fontSize * 0.3 : 0)
  if (above > 0) out.push({ kind: 'box', h: above })

  if (p.kind === 'table') {
    const rows = p.tableRows ?? [[0]]
    for (const cells of rows) {
      const colW = Math.max(36, g.contentW / Math.max(1, cells.length) - CELL_PAD_PT)
      const tallest = Math.max(
        1,
        ...cells.map((c) => (c > 0 ? wrappedLines(c, doc.defaultFontSize, colW) : 1)),
      )
      out.push({ kind: 'box', h: tallest * g.defaultLineH + CELL_PAD_PT })
    }
  } else {
    const images = p.images ?? []
    if (images.length) {
      const width = images.reduce((s, i) => s + i.widthPt, 0)
      // Images that fit side by side share one row; otherwise they stack.
      const h =
        width <= g.contentW
          ? Math.max(...images.map((i) => i.heightPt))
          : images.reduce((s, i) => s + i.heightPt, 0)
      out.push({ kind: 'box', h })
    }
    if (text.trim().length > 0 || images.length === 0) {
      const inset =
        (p.indentStartPt ?? (p.kind === 'bullet' ? BULLET_INSET_PT : 0)) + (p.indentEndPt ?? 0)
      const lines = text.trim().length ? wrappedLines(text.length, fontSize, g.contentW - inset) : 1
      for (let i = 0; i < lines; i++) out.push({ kind: 'line', h: lh })
    }
  }

  if (below > 0) out.push({ kind: 'box', h: below })
  return out
}

interface Layout {
  pages: number
  /** Absolute vertical position (pages stacked) where each paragraph starts. */
  starts: number[]
  /** Absolute position of the end of the content. */
  end: number
  g: Geometry
}

function layout(doc: DocModel): Layout {
  const g = geometry(doc)
  let page = 0
  let y = 0
  const starts: number[] = []
  for (const p of doc.paragraphs) {
    starts.push(page * g.contentH + y)
    if (p.kind === 'pageBreak') {
      page++
      y = 0
      continue
    }
    for (const piece of pieces(p, doc, g)) {
      // Anything that doesn't fit moves to a fresh page. An oversized box on an empty page
      // stays put (it overflows, as Docs scales or clips it).
      if (y > 0 && y + piece.h > g.contentH + EPS) {
        page++
        y = 0
      }
      y += piece.h
    }
  }
  return { pages: page + 1, starts, end: page * g.contentH + y, g }
}

export function estimatePages(doc: DocModel): PageEstimate {
  const l = layout(doc)
  return {
    pages: Math.max(1, l.pages),
    lines: Math.round(l.end / l.g.defaultLineH),
    linesPerPage: l.g.contentH / l.g.defaultLineH,
  }
}

/**
 * Where a character offset sits in the document. `fraction` is its share of the laid-out
 * height (0..1), used to scroll the live Doc; `page` is its 0-based page. Approximate by
 * design: Google Docs renders to canvas, so exact pixels aren't available.
 */
export function lineLocation(
  doc: DocModel,
  charOffset: number,
): { linesBefore: number; totalLines: number; fraction: number; page: number } {
  const l = layout(doc)
  let idx = doc.paragraphs.findIndex((p) => p.end != null && charOffset <= p.end)
  if (idx < 0) idx = doc.paragraphs.length - 1
  const at = idx >= 0 ? l.starts[idx] : l.end
  return {
    linesBefore: Math.round(at / l.g.defaultLineH),
    totalLines: Math.round(l.end / l.g.defaultLineH),
    fraction: l.end > 0 ? Math.min(1, at / l.end) : 0,
    page: Math.floor(at / l.g.contentH),
  }
}
