// Turns a GreenPages fix into exact steps for Word's own editing API, and lines Word's
// paragraph list up with our document model so a step can never hit the wrong paragraph.
//
// Pure logic with no Office calls, so it can be tested without Word. Fixes that cannot be
// done exactly through the API are reported as unsupported with a reason; the Word file tool
// handles those.

import { hasWideIndent, paragraphText, wideIndentSides, type DocModel } from '../lib/docModel'
import type { EditAction, Range } from '../lib/analyzer/types'
import type { TopKind } from '../lib/ooxml/ooxml'

export interface WordPara {
  text: string
  /** 0 for a body paragraph; above 0 when it sits inside a table. */
  nesting: number
}

export type Alignment = { ok: true; wordIndex: (number | null)[] } | { ok: false; reason: string }

const norm = (s: string) => s.replace(/[\s ]+/g, ' ').trim()

/**
 * Pair each model paragraph with the matching entry in Word's paragraph list. Any doubt
 * (content controls, a different count, different text) refuses, so edits never land on the
 * wrong paragraph.
 */
export function alignParagraphs(model: DocModel, kinds: TopKind[], word: WordPara[]): Alignment {
  const top = word.map((w, i) => (w.nesting === 0 ? i : -1)).filter((i) => i >= 0)
  const wordIndex: (number | null)[] = []
  let next = 0
  for (let k = 0; k < model.paragraphs.length; k++) {
    const kind = kinds[k]
    if (kind === 'other') {
      return { ok: false, reason: 'This document has content controls or other structures GreenPages cannot line up safely.' }
    }
    if (kind === 'tbl') {
      wordIndex.push(null)
      continue
    }
    const at = top[next++]
    if (at === undefined) return { ok: false, reason: 'Word reports fewer paragraphs than the file.' }
    const p = model.paragraphs[k]
    // Opaque paragraphs (fields, shapes, section breaks) are modelled as blank "table" kinds.
    if (p.kind !== 'table' && norm(paragraphText(p)) !== norm(word[at].text)) {
      return { ok: false, reason: `The text in paragraph ${k + 1} does not match what Word reports.` }
    }
    wordIndex.push(at)
  }
  if (next !== top.length) return { ok: false, reason: 'Word reports more paragraphs than the file.' }
  return { ok: true, wordIndex }
}

export type Op =
  | { op: 'deleteParagraph'; at: number }
  | { op: 'setIndent'; at: number; left: boolean; right: boolean }
  | { op: 'scalePictures'; at: number; scale: number; only?: number }
  | { op: 'setFont'; at: number; size?: number; clearHighlight?: boolean; alt?: 'underline' | 'italic' }
  | { op: 'replaceText'; at: number; text: string }

export type Plan = { ok: true; ops: Op[] } | { ok: false; reason: string }

const overlaps = (a: Range, b: { start?: number; end?: number }) => b.start! < a.end && b.end! > a.start
const within = (a: Range, b: { start?: number; end?: number }) => b.start! >= a.start && b.end! <= a.end

const NEEDS_FILE_TOOL = 'Use the Word file tool for this one.'

export function planAction(action: EditAction, model: DocModel, map: (number | null)[]): Plan {
  const ps = model.paragraphs
  const at = (k: number) => map[k]
  const hit = (pred: (k: number) => boolean) => ps.map((_, k) => k).filter((k) => pred(k) && at(k) != null)

  switch (action.kind) {
    case 'removeBlankLines': {
      const blanks = hit((k) => {
        const p = ps[k]
        return within(action.range, p) && p.kind !== 'pageBreak' && p.kind !== 'table' && !p.isRule && !p.images?.length
      })
      if (blanks.length === 0) return { ok: true, ops: [] }
      const last = blanks[blanks.length - 1]
      const before = ps[blanks[0] - 1]
      const trailing = last === ps.length - 1
      const drop = trailing && before && before.kind !== 'table' ? blanks : blanks.slice(0, -1)
      return { ok: true, ops: drop.map((k) => ({ op: 'deleteParagraph' as const, at: at(k)! })) }
    }

    case 'reduceIndents': {
      const ops: Op[] = hit((k) => overlaps(action.range, ps[k]) && hasWideIndent(ps[k])).map((k) => {
        const s = wideIndentSides(ps[k])
        return { op: 'setIndent' as const, at: at(k)!, left: s.left, right: s.right }
      })
      return { ok: true, ops }
    }

    case 'resizeImage': {
      const ops: Op[] = []
      for (const k of hit((k) => !!ps[k].images?.length && (!!action.objectId || within(action.range, ps[k])))) {
        ps[k].images!.forEach((img, n) => {
          if (action.objectId && img.objectId !== action.objectId) return
          ops.push({ op: 'scalePictures', at: at(k)!, scale: action.scale, only: n })
        })
      }
      return { ok: true, ops }
    }

    case 'setFontSize':
    case 'removeHighlight': {
      const ops: Op[] = []
      for (const k of hit((k) => overlaps(action.range, ps[k]))) {
        // Word's API formats whole ranges; only paragraphs fully covered by the fix are safe.
        const text = ps[k].runs.filter((r) => r.text.length > 0)
        if (!text.every((r) => overlaps(action.range, r))) {
          return { ok: false, reason: `This covers only part of a paragraph. ${NEEDS_FILE_TOOL}` }
        }
        ops.push(
          action.kind === 'setFontSize'
            ? { op: 'setFont', at: at(k)!, size: action.to }
            : { op: 'setFont', at: at(k)!, clearHighlight: true, alt: action.alt },
        )
      }
      return { ok: true, ops }
    }

    case 'replaceText': {
      const k = hit((k) => overlaps(action.range, ps[k]))[0]
      return k == null ? { ok: true, ops: [] } : { ok: true, ops: [{ op: 'replaceText', at: at(k)!, text: action.text }] }
    }

    case 'pageBreakToRule':
      return { ok: false, reason: `Add-ins cannot draw the dividing line yet. ${NEEDS_FILE_TOOL}` }
    case 'bulletsToTable':
      return { ok: false, reason: `Turning a list into a table is not safe through Word's add-in API. ${NEEDS_FILE_TOOL}` }
    case 'setMargins':
      return { ok: false, reason: `Margins cannot be changed from an add-in yet. Use Layout, then Margins in Word, or the Word file tool.` }
  }
}
