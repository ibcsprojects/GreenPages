// Google Docs API integration: OAuth token handling, reading a live document into our
// DocModel (with Docs index anchors for write-back), and pushing batchUpdate edits.
// All Chrome/identity specifics live here so docBackend stays a pure edit-translation layer.

import type { DocImage, DocModel, Paragraph, TextRun } from './docModel'
import { BULLET_GLYPH, rebuildOffsets } from './docModel'

const DOCS_GET = (id: string) => `https://docs.googleapis.com/v1/documents/${id}`
const DOCS_BATCH = (id: string) =>
  `https://docs.googleapis.com/v1/documents/${id}:batchUpdate`
// Docs' own "Download as PDF" URL. Fetched with the user's existing docs.google.com
// session (cookies), not an OAuth token, so it needs no Drive scope at all.
const DOCS_EXPORT_PDF = (id: string) =>
  `https://docs.google.com/document/d/${id}/export?format=pdf`

const DEFAULT_FONT = 11

/** Parse the document id out of a Google Docs URL, or null if it isn't one. */
export function docIdFromUrl(url: string | undefined): string | null {
  const m = (url ?? '').match(
    /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/,
  )
  return m ? m[1] : null
}

// --- OAuth -----------------------------------------------------------------
// The only scope is `documents` (read and edit the doc the user is working in).
// getAuthToken caches internally: interactive:true shows Google's consent screen the first
// time only; interactive:false never shows UI and fails if the user hasn't consented yet.
let interactiveAllowed = false

/** Allow (or forbid) showing Google's sign-in UI. Set by the worker per request, so a page
 *  load never pops a consent window: only a user click does. */
export function setInteractiveAuth(allowed: boolean): void {
  interactiveAllowed = allowed
}

function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result: unknown) => {
      const err = chrome.runtime.lastError
      // Newer Chrome returns { token }, older returns a bare string.
      const token =
        typeof result === 'string'
          ? result
          : (result as { token?: string } | undefined)?.token
      if (err || !token) return reject(new Error(err?.message ?? 'no auth token'))
      resolve(token)
    })
  })
}

function invalidate(token: string): Promise<void> {
  return new Promise((resolve) =>
    chrome.identity.removeCachedAuthToken({ token }, () => resolve()),
  )
}

/** Fetch with the Docs OAuth token; refreshes the token once on a 401 (expired/revoked). */
async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token = await getToken(interactiveAllowed)
  const call = (t: string) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
    })
  let res = await call(token)
  if (res.status === 401) {
    await invalidate(token)
    token = await getToken(interactiveAllowed)
    res = await call(token)
  }
  return res
}

/** True when the user has already granted access, checked without showing any UI. */
export async function hasDocsAccess(): Promise<boolean> {
  try {
    await getToken(false)
    return true
  } catch {
    return false
  }
}

// --- Read ------------------------------------------------------------------
/** Fetch the raw Docs API document. Exposed so the table flow can read cell indices that
 *  our DocModel deliberately drops (it doesn't model tables). */
export async function fetchGoogleDocRaw(docId: string): Promise<ApiDoc> {
  const res = await authedFetch(DOCS_GET(docId))
  if (!res.ok) throw new Error(`documents.get ${res.status}`)
  return (await res.json()) as ApiDoc
}

export async function fetchGoogleDoc(docId: string): Promise<DocModel> {
  return mapApiDoc(docId, await fetchGoogleDocRaw(docId))
}

/**
 * Insertion indices (row-major) for the cells of a freshly inserted table — the start of
 * each cell's empty paragraph, which is where cell text goes. Picks the first table at or
 * after `atOrAfter` (the index we inserted at), falling back to the last table found.
 */
export function tableCellStarts(api: ApiDoc, atOrAfter: number): number[] {
  const content = api.body?.content ?? []
  const tables = content
    .filter((el) => el.table && el.startIndex != null)
    .sort((a, b) => a.startIndex! - b.startIndex!)
  const tbl = tables.find((t) => t.startIndex! >= atOrAfter) ?? tables[tables.length - 1]
  const starts: number[] = []
  for (const row of tbl?.table?.tableRows ?? []) {
    for (const cell of row.tableCells ?? []) {
      const para = (cell.content ?? []).find((c) => c.paragraph)
      const idx = para?.startIndex ?? cell.startIndex
      if (idx != null) starts.push(idx)
    }
  }
  return starts
}

// --- Exact page count (experimental) ---------------------------------------
/**
 * The real number of printed pages, read from Docs' own PDF export using the user's
 * existing Google session. This replaces the old Drive API export, so Sparepage needs no
 * Drive scope (Drive scopes are "restricted" and require a paid annual security audit).
 *
 * Undocumented by Google: it may be blocked or change without notice. Every failure throws
 * so the caller falls back to the layout estimate, labelled "estimate" in the UI.
 */
export async function fetchExportPageCount(docId: string, timeoutMs = 20000): Promise<number> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(DOCS_EXPORT_PDF(docId), {
      credentials: 'include',
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`export ${res.status}`)
    // A signed-out or blocked request comes back as an HTML page, not a PDF.
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('pdf')) throw new Error(`export returned ${type || 'no content type'}`)
    const count = countPdfPages(await res.arrayBuffer())
    if (count <= 0) throw new Error('could not read the page count from the export')
    return count
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Count pages in a PDF's bytes without a parser. The page-tree root carries `/Count N`
 * (total leaf pages); we read it from any `/Type /Pages` dictionary and take the largest.
 * If that's unavailable (e.g. compressed object streams), fall back to counting `/Type
 * /Page` leaf objects. Google Docs exports keep page objects in plain (uncompressed) form.
 */
export function countPdfPages(bytes: ArrayBuffer): number {
  // Latin1 maps each byte to one char, so the ASCII PDF structure survives intact.
  const text = new TextDecoder('latin1').decode(bytes)
  let fromCount = 0
  const pagesDict = /\/Type\s*\/Pages\b/g
  let m: RegExpExecArray | null
  while ((m = pagesDict.exec(text))) {
    // /Count and /Type can appear in either order within the same small dictionary.
    const near = text.slice(Math.max(0, m.index - 200), m.index + 200)
    const c = near.match(/\/Count\s+(\d+)/)
    if (c) fromCount = Math.max(fromCount, parseInt(c[1], 10))
  }
  if (fromCount > 0) return fromCount
  // Leaf pages are `/Type /Page` but not `/Type /Pages` — exclude the trailing 's'/letters.
  const leaves = text.match(/\/Type\s*\/Page(?![s\w])/g)
  return leaves ? leaves.length : 0
}

// --- Write -----------------------------------------------------------------
export async function pushBatchUpdate(docId: string, requests: unknown[]): Promise<void> {
  if (requests.length === 0) return
  const res = await authedFetch(DOCS_BATCH(docId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`batchUpdate ${res.status}: ${await res.text()}`)
}

// --- Mapping: Docs API document -> DocModel --------------------------------
// We read only the handful of fields we model. Each run carries its Docs startIndex and
// each paragraph its [startIndex, endIndex) so docBackend can translate edits back.
interface ApiRgb {
  red?: number
  green?: number
  blue?: number
}
interface ApiTextStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: { magnitude?: number }
  backgroundColor?: { color?: { rgbColor?: ApiRgb } }
}
interface ApiElement {
  startIndex?: number
  endIndex?: number
  textRun?: { content?: string; textStyle?: ApiTextStyle }
  pageBreak?: unknown
  horizontalRule?: unknown
  inlineObjectElement?: { inlineObjectId?: string }
}
interface ApiDimension {
  magnitude?: number
  unit?: string
}
interface ApiInlineObject {
  inlineObjectProperties?: {
    embeddedObject?: {
      size?: { height?: ApiDimension; width?: ApiDimension }
      imageProperties?: { contentUri?: string; sourceUri?: string }
    }
  }
}
interface ApiParagraph {
  elements?: ApiElement[]
  paragraphStyle?: {
    namedStyleType?: string
    indentStart?: ApiDimension
    indentEnd?: ApiDimension
    borderBottom?: { width?: ApiDimension }
    lineSpacing?: number
    spaceAbove?: ApiDimension
    spaceBelow?: ApiDimension
  }
  bullet?: unknown
}
interface ApiTableCell {
  startIndex?: number
  endIndex?: number
  content?: ApiStructural[]
}
interface ApiTableRow {
  startIndex?: number
  endIndex?: number
  tableCells?: ApiTableCell[]
}
interface ApiTable {
  rows?: number
  columns?: number
  tableRows?: ApiTableRow[]
}
interface ApiStructural {
  startIndex?: number
  endIndex?: number
  paragraph?: ApiParagraph
  table?: ApiTable
}
interface ApiDocumentStyle {
  marginTop?: ApiDimension
  marginBottom?: ApiDimension
  marginLeft?: ApiDimension
  marginRight?: ApiDimension
  pageSize?: { width?: ApiDimension; height?: ApiDimension }
}
export interface ApiDoc {
  title?: string
  body?: { content?: ApiStructural[] }
  inlineObjects?: Record<string, ApiInlineObject>
  documentStyle?: ApiDocumentStyle
}

export function mapApiDoc(docId: string, api: ApiDoc): DocModel {
  const paragraphs: Paragraph[] = []
  let i = 0
  for (const el of api.body?.content ?? []) {
    if (el.paragraph) {
      paragraphs.push(mapParagraph(`p${i++}`, el, el.paragraph, api.inlineObjects ?? {}))
    } else if (el.table) {
      // We don't model a table's cells, but it MUST appear in the paragraph list as a
      // non-blank element carrying its real doc range — otherwise the paragraphs either
      // side of it look adjacent and a blank-run / bullet-run collapse would delete the
      // table along with them.
      paragraphs.push({
        id: `t${i++}`,
        kind: 'table',
        runs: [{ text: '', fontSize: DEFAULT_FONT, docStart: el.startIndex }],
        tableRows: tableCellChars(el.table),
        docStart: el.startIndex,
        docEnd: el.endIndex,
      })
    }
    // else: sectionBreak / TOC etc. — still skipped (no destructive edits target them).
  }
  if (paragraphs.length === 0) {
    paragraphs.push({ id: 'p0', kind: 'normal', runs: [{ text: '', fontSize: DEFAULT_FONT }] })
  }
  const ds = api.documentStyle
  // Docs omits a margin field when it's the 1in default, so fall back to 72pt per side.
  const margins = ds
    ? {
        topPt: ds.marginTop?.magnitude ?? 72,
        bottomPt: ds.marginBottom?.magnitude ?? 72,
        leftPt: ds.marginLeft?.magnitude ?? 72,
        rightPt: ds.marginRight?.magnitude ?? 72,
      }
    : undefined
  return rebuildOffsets({
    id: docId,
    title: api.title ?? 'Untitled',
    defaultFontSize: DEFAULT_FONT,
    linesPerPage: 46,
    paragraphs,
    pageWidthPt: ds?.pageSize?.width?.magnitude,
    pageHeightPt: ds?.pageSize?.height?.magnitude,
    ...(margins ? { margins } : {}),
  })
}

function mapParagraph(
  id: string,
  el: ApiStructural,
  para: ApiParagraph,
  inlineObjects: Record<string, ApiInlineObject>,
): Paragraph {
  const elements = para.elements ?? []
  const named = para.paragraphStyle?.namedStyleType ?? ''
  const runs: TextRun[] = elements.filter((e) => e.textRun).map(mapRun)
  const images = mapImages(elements, inlineObjects)
  if (runs.length === 0) {
    // Empty / break-only paragraphs still need a run so the analyzer + offsets work.
    runs.push({ text: '', fontSize: DEFAULT_FONT, docStart: el.startIndex })
  }

  // A paragraph is a list item if Docs marks it (`para.bullet`, set by the list tool) OR it
  // was typed as a manual bullet ("• …", "- …"). The latter has no `bullet` field, so without
  // the glyph check those lists would read as plain paragraphs and never flag as sprawl.
  const text = runs.map((r) => r.text).join('')
  const kind: Paragraph['kind'] = elements.some((e) => e.pageBreak)
    ? 'pageBreak'
    : para.bullet || BULLET_GLYPH.test(text)
      ? 'bullet'
      : named.startsWith('HEADING') || named === 'TITLE'
        ? 'heading'
        : 'normal'

  const indentStartPt = para.paragraphStyle?.indentStart?.magnitude
  const indentEndPt = para.paragraphStyle?.indentEnd?.magnitude
  const lineSpacing = para.paragraphStyle?.lineSpacing
  const spaceAbovePt = para.paragraphStyle?.spaceAbove?.magnitude
  const spaceBelowPt = para.paragraphStyle?.spaceBelow?.magnitude
  // A horizontal line is a separator, not a blank line. It shows up either as a real
  // `horizontalRule` element (Insert → Horizontal line) or as our bottom-border rule.
  const hasHorizontalRule = elements.some((e) => e.horizontalRule)
  const hasBottomBorder = (para.paragraphStyle?.borderBottom?.width?.magnitude ?? 0) > 0
  const isRule = hasHorizontalRule || (hasBottomBorder && text.trim() === '')

  return {
    id,
    kind,
    runs,
    ...(images.length ? { images } : {}),
    ...(indentStartPt ? { indentStartPt } : {}),
    ...(indentEndPt ? { indentEndPt } : {}),
    ...(isRule ? { isRule: true } : {}),
    ...(lineSpacing ? { lineSpacing } : {}),
    ...(spaceAbovePt != null ? { spaceAbovePt } : {}),
    ...(spaceBelowPt != null ? { spaceBelowPt } : {}),
    docStart: el.startIndex,
    docEnd: el.endIndex,
  }
}

/** Character count of every cell, row by row, for the page estimate. */
function tableCellChars(table: ApiTable): number[][] {
  return (table.tableRows ?? []).map((row) =>
    (row.tableCells ?? []).map((cell) =>
      (cell.content ?? []).reduce(
        (sum, s) =>
          sum +
          (s.paragraph?.elements ?? []).reduce(
            (n, e) => n + (e.textRun?.content ?? '').replace(/\n$/, '').length,
            0,
          ),
        0,
      ),
    ),
  )
}

/** Collect inline images in a paragraph, resolving each element's size from the doc's
 *  inlineObjects map. Sizes come back from the API in points. */
function mapImages(
  elements: ApiElement[],
  inlineObjects: Record<string, ApiInlineObject>,
): DocImage[] {
  const images: DocImage[] = []
  for (const e of elements) {
    const objectId = e.inlineObjectElement?.inlineObjectId
    if (!objectId) continue
    const embedded = inlineObjects[objectId]?.inlineObjectProperties?.embeddedObject
    const size = embedded?.size
    const widthPt = size?.width?.magnitude
    const heightPt = size?.height?.magnitude
    // sourceUri (the original public URL) re-inserts most reliably; contentUri is a
    // short-lived, account-tagged fallback for uploaded/pasted images.
    const uri = embedded?.imageProperties?.sourceUri || embedded?.imageProperties?.contentUri
    if (widthPt && heightPt) images.push({ objectId, widthPt, heightPt, docStart: e.startIndex, uri })
  }
  return images
}

function mapRun(e: ApiElement): TextRun {
  const ts = e.textRun!.textStyle ?? {}
  const raw = e.textRun!.content ?? ''
  // Docs carries the paragraph's newline on its final run; our flat model adds it back via
  // rebuildOffsets, so strip it here to keep offsets aligned.
  const text = raw.endsWith('\n') ? raw.slice(0, -1) : raw
  return {
    text,
    bold: ts.bold || undefined,
    italic: ts.italic || undefined,
    underline: ts.underline || undefined,
    highlightColor: rgbToHex(ts.backgroundColor?.color?.rgbColor),
    fontSize: ts.fontSize?.magnitude ?? DEFAULT_FONT,
    docStart: e.startIndex,
  }
}

function rgbToHex(rgb?: ApiRgb): string | null {
  if (!rgb) return null
  const c = (v?: number) =>
    Math.round((v ?? 0) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${c(rgb.red)}${c(rgb.green)}${c(rgb.blue)}`
}
