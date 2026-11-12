// Picks the text that Google Docs' Find bar should search for to land on a flagged span.
//
// Docs paints the page to a canvas, so the only way to move to a spot from a content script is
// its own Find. Find is fussy: a query with line breaks, curly quotes, non-breaking spaces or
// the placeholder characters Docs uses for images finds nothing, and a very long query is a
// needless risk. So instead of searching for the whole flagged span we search for one short,
// plain stretch of it. When the span has no usable text (blank lines, a page break, an image)
// we anchor on the nearest plain text beside it, which lands the reader right next to it.

import type { Range } from './analyzer/types'

const MAX_QUERY = 60
const MIN_QUERY = 4
/** How far to look for neighbouring text when the span itself has none. */
const NEIGHBOUR_CHARS = 400

// Letters and digits in any language, spaces, and a few punctuation marks that Find treats
// literally. Anything else ends a stretch.
const SAFE = /[\p{L}\p{N} ,.;:()%/&-]/u
const SPACES = /[   -   　]/g

export interface RevealQuery {
  query: string
  /** true when the query comes from the flagged span itself, false when from beside it. */
  exact: boolean
}

/** Runs of plain text in `text`, split wherever a character Find may not match appears. */
function stretches(text: string): string[] {
  const out: string[] = []
  let cur = ''
  for (const ch of text.replace(SPACES, ' ')) {
    if (SAFE.test(ch)) cur += ch
    else {
      out.push(cur)
      cur = ''
    }
  }
  out.push(cur)
  return out.map(tidy).filter((s) => s.length > 0)
}

/** Collapse spaces and trim stray punctuation from both ends. */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:()/&%-]+|[\s.,;:()/&%-]+$/g, '')
    .trim()
}

/** The first `MAX_QUERY` characters, cut at a word boundary. */
function head(s: string): string {
  if (s.length <= MAX_QUERY) return s
  const cut = s.slice(0, MAX_QUERY)
  const space = cut.lastIndexOf(' ')
  return tidy(space >= 20 ? cut.slice(0, space) : cut)
}

/** The last `MAX_QUERY` characters, cut at a word boundary. */
function tail(s: string): string {
  if (s.length <= MAX_QUERY) return s
  const cut = s.slice(s.length - MAX_QUERY)
  const space = cut.indexOf(' ')
  return tidy(space >= 0 && space <= MAX_QUERY - 20 ? cut.slice(space + 1) : cut)
}

/** The first stretch long enough to be distinctive, or failing that the longest one. */
function pickFirst(list: string[]): string | null {
  if (list.length === 0) return null
  return list.find((s) => s.length >= 12) ?? list.reduce((a, b) => (b.length > a.length ? b : a))
}

/** The last stretch long enough to be distinctive, or failing that the longest one. */
function pickLast(list: string[]): string | null {
  if (list.length === 0) return null
  for (let i = list.length - 1; i >= 0; i--) if (list[i].length >= 12) return list[i]
  return list.reduce((a, b) => (b.length > a.length ? b : a))
}

/**
 * The text to search for in order to reveal `range` of `fullText`, or null when the document
 * has no usable text anywhere near it (the caller then scrolls by position instead).
 */
export function revealQuery(fullText: string, range: Range): RevealQuery | null {
  const own = pickFirst(stretches(fullText.slice(range.start, range.end)))
  if (own && own.length >= MIN_QUERY) return { query: head(own), exact: true }

  // Nothing searchable in the span: anchor on the text just above it, then just below it.
  const above = pickLast(stretches(fullText.slice(Math.max(0, range.start - NEIGHBOUR_CHARS), range.start)))
  if (above && above.length >= MIN_QUERY) return { query: tail(above), exact: false }
  const below = pickFirst(stretches(fullText.slice(range.end, range.end + NEIGHBOUR_CHARS)))
  if (below && below.length >= MIN_QUERY) return { query: head(below), exact: false }
  return null
}
