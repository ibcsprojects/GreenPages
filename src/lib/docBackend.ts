// The edit seam. The side panel never touches a DocModel directly — it asks an
// EditBackend to apply an EditAction. Today that's MockDocsBackend (mutates the bundled
// sample doc, fully working offline). When OAuth + the Docs API are configured, swap in
// GoogleDocsBackend (below) with no UI changes: it maps each EditAction to a Google Docs
// `batchUpdate` request.

import type { DocModel, Paragraph, TextRun } from './docModel'
import { cloneDoc, rebuildOffsets } from './docModel'
import type { EditAction, Range } from './analyzer/types'
import { fetchGoogleDoc, fetchGoogleDocRaw, pushBatchUpdate, tableCellStarts } from './googleDocs'
import { tableLayout } from './tableLayout'

export interface EditBackend {
  /** Apply one accepted fix, returning the new document state. */
  apply(doc: DocModel, action: EditAction): Promise<DocModel>
}

// Run-level overlap (runs always have non-zero length).
const overlaps = (a: Range, b: { start?: number; end?: number }) =>
  b.start! < a.end && b.end! > a.start

// Paragraph-level containment. Robust for zero-length (empty) paragraphs such as blank
// lines and page breaks, which sit exactly on a range boundary and fail strict overlap.
const within = (a: Range, b: { start?: number; end?: number }) =>
  b.start! >= a.start && b.end! <= a.end

// ---------------------------------------------------------------------------
// MockDocsBackend — pure, in-memory, works with zero credentials.
// ---------------------------------------------------------------------------
export class MockDocsBackend implements EditBackend {
  async apply(doc: DocModel, action: EditAction): Promise<DocModel> {
    const next = cloneDoc(doc)
    switch (action.kind) {
      case 'removeHighlight':
        forRuns(next, action.range, (r) => {
          r.highlightColor = null
          if (action.alt === 'underline') r.underline = true
          else r.italic = true
        })
        break

      case 'setFontSize':
        forRuns(next, action.range, (r) => {
          r.fontSize = action.to
        })
        break

      case 'removeBlankLines': {
        const blanks = next.paragraphs.filter(
          (p) => within(action.range, p) && p.kind !== 'pageBreak',
        )
        // keep the first blank, drop the rest
        const drop = new Set(blanks.slice(1).map((p) => p.id))
        next.paragraphs = next.paragraphs.filter((p) => !drop.has(p.id))
        break
      }

      case 'pageBreakToRule': {
        const p = next.paragraphs.find((x) => within(action.range, x))
        if (p) {
          p.kind = 'normal'
          p.runs = [
            { text: '— — — — — — — — — — — — — — — — —', fontSize: doc.defaultFontSize },
          ]
        }
        break
      }

      case 'bulletsToTable': {
        // Indices of the actual bullets in range; everything between the first and last
        // (bullets plus any blank spacer lines) is replaced by the grid.
        const idxs = next.paragraphs
          .map((p, k) => (overlaps(action.range, p) && p.kind === 'bullet' ? k : -1))
          .filter((k) => k >= 0)
        if (idxs.length === 0) break
        const firstIdx = idxs[0]
        const lastIdx = idxs[idxs.length - 1]
        // The offline model has no table primitive, so stand in with one normal paragraph
        // per grid row (cells joined by a bullet separator). GoogleDocsBackend emits a real
        // insertTable instead — see applyBulletsToTable. Both share tableLayout's grid, so
        // the line count (and thus the page estimate) matches the live result.
        const layout = tableLayout(action.rows)
        const baseId = next.paragraphs[firstIdx].id
        const replacements: Paragraph[] = []
        for (let r = 0; r < layout.rows; r++) {
          const cells = layout.cells
            .slice(r * layout.columns, (r + 1) * layout.columns)
            .filter((c) => c.length > 0)
          replacements.push({
            id: r === 0 ? baseId : `${baseId}-r${r}`,
            kind: 'normal',
            runs: [{ text: cells.join('    •    '), fontSize: doc.defaultFontSize }],
          })
        }
        next.paragraphs = [
          ...next.paragraphs.slice(0, firstIdx),
          ...replacements,
          ...next.paragraphs.slice(lastIdx + 1),
        ]
        break
      }

      case 'replaceText': {
        const p = next.paragraphs.find((x) => overlaps(action.range, x))
        if (p) {
          const first = p.runs[0] ?? { text: '', fontSize: doc.defaultFontSize }
          p.runs = [{ ...first, text: action.text }]
        }
        break
      }

      case 'resizeImage': {
        for (const p of next.paragraphs) {
          if (!p.images) continue
          // Match by object id when we have one (live docs); otherwise by the paragraph
          // the flag was anchored to (offline mock).
          if (!action.objectId && !within(action.range, p)) continue
          for (const img of p.images) {
            if (action.objectId && img.objectId !== action.objectId) continue
            img.widthPt = Math.round(img.widthPt * action.scale)
            img.heightPt = Math.round(img.heightPt * action.scale)
          }
        }
        break
      }
    }
    return rebuildOffsets(next)
  }
}

function forRuns(doc: DocModel, range: Range, fn: (r: TextRun) => void) {
  for (const p of doc.paragraphs) {
    if (!overlaps(range, p)) continue
    for (const r of p.runs) if (overlaps(range, r)) fn(r)
  }
}

// ---------------------------------------------------------------------------
// GoogleDocsBackend — the live path. Each EditAction becomes one or more Docs API
// `batchUpdate` requests, addressed by real document indices (translated from our
// flat-text offsets via the anchors captured at read time). After every edit we
// re-read the document so our model and the Docs indices stay perfectly in sync for
// the next edit, sidestepping any index-shift bookkeeping.
// ---------------------------------------------------------------------------
export class GoogleDocsBackend implements EditBackend {
  constructor(private documentId: string) {}

  async apply(doc: DocModel, action: EditAction): Promise<DocModel> {
    // A real table can't be built in one batch: its cell indices don't exist until the
    // table is created, so it needs its own read-back-and-fill flow.
    if (action.kind === 'bulletsToTable') return this.applyBulletsToTable(doc, action)
    // The Docs API has no in-place image resize, so this deletes and re-inserts the image
    // at the smaller size — and reports clearly when it can't (no usable source URL).
    if (action.kind === 'resizeImage') return this.applyResizeImage(doc, action)
    await pushBatchUpdate(this.documentId, buildRequests(doc, action))
    return fetchGoogleDoc(this.documentId)
  }

  /**
   * Resize an inline image by deleting it and re-inserting it at the scaled size, since the
   * Docs API exposes no request to change an existing image's dimensions. Needs the image's
   * index and a fetchable source URL, both captured by the read path. Throws a clear,
   * user-facing message when the image can't be resized (e.g. an uploaded image whose only
   * URL is a private contentUri the insert step can't fetch).
   */
  private async applyResizeImage(
    doc: DocModel,
    action: Extract<EditAction, { kind: 'resizeImage' }>,
  ): Promise<DocModel> {
    const img = doc.paragraphs
      .flatMap((p) => p.images ?? [])
      .find((i) => i.objectId === action.objectId && action.objectId != null)
    if (!img || img.docStart == null) {
      throw new Error("Couldn't locate that image in the document to resize it.")
    }
    if (!img.uri) {
      throw new Error(
        "This image has no shareable source URL, so the Docs API can't re-insert it at a smaller size. Resize it by hand by dragging a corner handle.",
      )
    }
    const width = Math.round(img.widthPt * action.scale)
    const height = Math.round(img.heightPt * action.scale)
    // Delete the one-index image element, then insert the resized image where it was. In a
    // single batch these apply in order, so the insert index is the freed slot.
    await pushBatchUpdate(this.documentId, [
      { deleteContentRange: { range: { startIndex: img.docStart, endIndex: img.docStart + 1 } } },
      {
        insertInlineImage: {
          uri: img.uri,
          location: { index: img.docStart },
          objectSize: {
            width: { magnitude: width, unit: 'PT' },
            height: { magnitude: height, unit: 'PT' },
          },
        },
      },
    ])
    return fetchGoogleDoc(this.documentId)
  }

  /**
   * Replace a run of bullets with a real Google Docs table, in two passes:
   *  1. strip the bullet list and insert an *empty* table where it was;
   *  2. re-read the doc to learn each cell's index, then fill the cells (highest index
   *     first, so earlier insertions don't shift the ones still to come).
   */
  private async applyBulletsToTable(
    doc: DocModel,
    action: Extract<EditAction, { kind: 'bulletsToTable' }>,
  ): Promise<DocModel> {
    const bullets = doc.paragraphs.filter(
      (p) => overlaps(action.range, p) && p.kind === 'bullet' && p.docStart != null,
    )
    if (bullets.length === 0) return fetchGoogleDoc(this.documentId)

    const layout = tableLayout(action.rows)
    const startIndex = bullets[0].docStart!
    const endIndex = bullets[bullets.length - 1].docEnd! - 1 // keep one trailing newline

    // Pass 1: drop the list formatting + text, then insert the empty grid at its start.
    const setup: unknown[] = []
    if (endIndex > startIndex) {
      const range = { startIndex, endIndex }
      setup.push({ deleteParagraphBullets: { range } })
      setup.push({ deleteContentRange: { range } })
    }
    setup.push({
      insertTable: {
        rows: layout.rows,
        columns: layout.columns,
        location: { index: startIndex },
      },
    })
    await pushBatchUpdate(this.documentId, setup)

    // Pass 2: locate the new table's cells and fill them in descending-index order.
    const raw = await fetchGoogleDocRaw(this.documentId)
    const cellStarts = tableCellStarts(raw, startIndex)
    const fill = cellStarts
      .map((index, i) => ({ index, text: layout.cells[i] ?? '' }))
      .filter((c) => c.text.length > 0)
      .sort((a, b) => b.index - a.index)
      .map((c) => ({ insertText: { location: { index: c.index }, text: c.text } }))
    if (fill.length) await pushBatchUpdate(this.documentId, fill)

    return fetchGoogleDoc(this.documentId)
  }
}

// --- flat-offset → Docs index translation ---------------------------------
// Within a single run, characters map 1:1 to Docs indices, so a flat offset is
// run.docStart + (offset - run.start). Paragraph-level edits use the paragraph's
// stored [docStart, docEnd) which includes the trailing newline.
function toDocIndex(doc: DocModel, offset: number): number {
  for (const p of doc.paragraphs) {
    for (const r of p.runs) {
      if (r.docStart == null || r.start == null || r.end == null) continue
      if (offset >= r.start && offset <= r.end) return r.docStart + (offset - r.start)
    }
  }
  // Fallback to just past the last anchored run (e.g. trailing-edge offsets).
  const runs = doc.paragraphs.flatMap((p) => p.runs).filter((r) => r.docStart != null)
  const last = runs[runs.length - 1]
  return last ? last.docStart! + ((last.end ?? 0) - (last.start ?? 0)) : 1
}

const docRange = (doc: DocModel, r: Range) => ({
  startIndex: toDocIndex(doc, r.start),
  endIndex: toDocIndex(doc, r.end),
})

/** Map an EditAction to Google Docs API `batchUpdate` requests using real doc indices. */
export function buildRequests(doc: DocModel, action: EditAction): unknown[] {
  switch (action.kind) {
    case 'removeHighlight':
      return [
        {
          updateTextStyle: {
            range: docRange(doc, action.range),
            textStyle: {
              backgroundColor: {}, // clear highlight
              underline: action.alt === 'underline',
              italic: action.alt === 'italic',
            },
            fields: 'backgroundColor,underline,italic',
          },
        },
      ]

    case 'setFontSize':
      return [
        {
          updateTextStyle: {
            range: docRange(doc, action.range),
            textStyle: { fontSize: { magnitude: action.to, unit: 'PT' } },
            fields: 'fontSize',
          },
        },
      ]

    case 'replaceText': {
      const r = docRange(doc, action.range)
      const reqs: unknown[] = []
      if (r.endIndex > r.startIndex) reqs.push({ deleteContentRange: { range: r } })
      // Requests apply sequentially: after the delete, startIndex is the insert point.
      reqs.push({ insertText: { location: { index: r.startIndex }, text: action.text } })
      return reqs
    }

    case 'removeBlankLines': {
      // Keep the first blank line, delete the structural extent of the rest (text + newline).
      const blanks = doc.paragraphs.filter(
        (p) => within(action.range, p) && p.kind !== 'pageBreak' && p.docStart != null,
      )
      const drop = blanks.slice(1)
      if (drop.length === 0) return []
      const startIndex = drop[0].docStart!
      const endIndex = drop[drop.length - 1].docEnd!
      return endIndex > startIndex
        ? [{ deleteContentRange: { range: { startIndex, endIndex } } }]
        : []
    }

    case 'pageBreakToRule': {
      // Delete the page-break content (keeping the paragraph's newline) and drop in a rule.
      const p = doc.paragraphs.find(
        (x) => within(action.range, x) && x.docStart != null && x.docEnd != null,
      )
      if (!p) return []
      const startIndex = p.docStart!
      const endIndex = p.docEnd! - 1 // preserve the trailing newline
      const reqs: unknown[] = []
      if (endIndex > startIndex) reqs.push({ deleteContentRange: { range: { startIndex, endIndex } } })
      reqs.push({
        insertText: { location: { index: startIndex }, text: RULE_TEXT },
      })
      return reqs
    }

    case 'bulletsToTable':
      // Tables need a two-pass create-then-fill flow (cell indices don't exist until the
      // table does), so GoogleDocsBackend.apply handles this action directly via
      // applyBulletsToTable rather than emitting one-shot batch requests here.
      return []

    case 'resizeImage':
      // Handled directly by GoogleDocsBackend.applyResizeImage (delete + re-insert at the
      // new size), since the Docs API has no in-place image resize request.
      return []
  }
}

const RULE_TEXT = '— — — — — — — — — — — — — — — — —'
