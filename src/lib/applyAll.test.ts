import { describe, it, expect } from 'vitest'
import { applyAllFixes } from './applyAll'
import { analyzeDoc } from './analyzer/rules'
import { MockDocsBackend, type EditBackend } from './docBackend'
import { SAMPLE_DOC, rebuildOffsets, type DocModel } from './docModel'

const backend: EditBackend = new MockDocsBackend()
// Local analysis with no AI (verbose only flags when the offline shortener actually helps,
// which the sample's padded paragraph does — so it resolves like the others).
const analyze = (d: DocModel) => analyzeDoc(d)
const apply = (d: DocModel, a: Parameters<EditBackend['apply']>[1]) => backend.apply(d, a)

describe('applyAllFixes', () => {
  it('resolves every flag on the sample doc in a single run', async () => {
    expect(analyzeDoc(SAMPLE_DOC).length).toBeGreaterThan(3) // sanity: there's work to do
    const { flags, applied } = await applyAllFixes(SAMPLE_DOC, analyze, apply)
    expect(applied).toBeGreaterThan(0)
    // One apply-all clears them all — no leftovers that would need another scan + apply-all.
    expect(flags).toHaveLength(0)
  })

  it('converts a page break next to blanks without leaving (or re-flagging) a blank line', async () => {
    // blanks then a page break: collapsing the blanks first leaves one blank right before the
    // page break, which becomes the rule line. The rule must not be re-counted as a blank.
    const doc: DocModel = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: [
        { id: 'a', kind: 'normal', runs: [{ text: 'Section one.', fontSize: 11 }] },
        { id: 'b1', kind: 'normal', runs: [{ text: '', fontSize: 11 }] },
        { id: 'b2', kind: 'normal', runs: [{ text: '', fontSize: 11 }] },
        { id: 'pb', kind: 'pageBreak', runs: [{ text: '', fontSize: 11 }] },
        { id: 'c', kind: 'normal', runs: [{ text: 'Section two.', fontSize: 11 }] },
      ],
    })
    const { doc: out, flags } = await applyAllFixes(doc, analyze, apply)
    expect(flags).toHaveLength(0) // converges
    expect(out.paragraphs.some((p) => p.kind === 'pageBreak')).toBe(false) // page break gone
    expect(out.paragraphs.some((p) => p.isRule)).toBe(true) // rule line survives the run
  })

  it('does not get stuck (or loop) on a fix that never resolves', async () => {
    // A fake analyzer that always returns the same flag whose apply is a no-op: applyAll must
    // attempt it once, then stop — not spin forever, not throw.
    const stuck: DocModel = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: [{ id: 'a', kind: 'normal', runs: [{ text: 'x', fontSize: 11 }] }],
    })
    let calls = 0
    const alwaysOneFlag = () => {
      calls++
      return [
        {
          id: `f-${calls}`,
          type: 'highlight' as const,
          severity: 'low' as const,
          range: { start: 0, end: 1 },
          title: 't',
          explanation: 'e',
          before: 'b',
          after: 'a',
          impact: { paper: 0, ink: 0 },
          action: { kind: 'removeHighlight' as const, range: { start: 0, end: 1 }, alt: 'underline' as const },
        },
      ]
    }
    const noop = (d: DocModel) => d
    const { flags } = await applyAllFixes(stuck, alwaysOneFlag, noop)
    // The single never-resolving flag is attempted once and then left in place.
    expect(flags).toHaveLength(1)
    expect(calls).toBeLessThan(10) // terminated quickly, no runaway loop
  })

  it('never applies a fix that leaves out whole sentences', async () => {
    const sentences = [
      'Paper is used in almost every school across the country and the amount that gets used is much larger than most people would ever imagine.',
      'Every year schools print millions of pages of worksheets, handouts, reports and notices, and a surprising share of those pages is thrown away after a single use.',
      'The cost of all this paper is not only financial, because making paper takes trees, water and a great deal of energy.',
      'Water is needed at nearly every stage of making paper, from the pulp to the finished sheets.',
      'Some schools have started to count how many pages each department prints, and a few of them have found that showing the numbers is enough to change habits.',
      'Printing on both sides of the sheet is one of the easiest changes, and it can cut paper use by close to half.',
      'Reducing margins, choosing a smaller font and removing blank pages also help to save paper without making documents harder to read.',
      'In the end the best way to cut paper waste is to think before printing and to check each document for pages that are not needed.',
    ]
    const doc: DocModel = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: [{ id: 'a', kind: 'normal', runs: [{ text: sentences.join(' '), fontSize: 11 }] }],
    })
    const before = analyzeDoc(doc)
    const long = before.find((f) => f.type === 'verbose')!
    expect(long.reviewFirst).toBe(true)

    const { doc: out, flags, applied } = await applyAllFixes(doc, analyze, apply)
    expect(applied).toBe(0)
    expect(out.paragraphs[0].runs.map((r) => r.text).join('')).toBe(sentences.join(' '))
    expect(flags.some((f) => f.reviewFirst)).toBe(true) // still there, waiting for a human
  })
})

