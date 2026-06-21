import { describe, it, expect } from 'vitest'
import { analyzeDoc, totalImpact } from './rules'
import { SAMPLE_DOC, rebuildOffsets, type DocModel } from '../docModel'
import { MockDocsBackend } from '../docBackend'
import { condenseLocally, looksVerbose } from './condense'

const flags = analyzeDoc(SAMPLE_DOC)
const typesIn = (t: string) => flags.filter((f) => f.type === t)

describe('analyzeDoc on the sample doc', () => {
  it('detects each of the seven waste categories', () => {
    for (const t of [
      'highlight',
      'fontSize',
      'doubleSpacing',
      'pageBreak',
      'bulletSprawl',
      'verbose',
      'largeImage',
    ]) {
      expect(typesIn(t).length, `expected at least one ${t} flag`).toBeGreaterThan(0)
    }
  })

  it('returns flags ordered by document position', () => {
    const starts = flags.map((f) => f.range.start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('reports a positive total paper saving', () => {
    expect(totalImpact(flags).paper).toBeGreaterThan(0)
  })

  it('does not flag headings for large font size', () => {
    // The 20pt title is a heading and must not be flagged.
    const fontFlags = typesIn('fontSize')
    expect(fontFlags.every((f) => f.before.includes('18pt'))).toBe(true)
  })
})

describe('bulletSprawl detection', () => {
  const bulletDoc = (texts: string[]): DocModel =>
    rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: texts.map((text, i) => ({
        id: `b${i}`,
        kind: 'bullet' as const,
        runs: [{ text, fontSize: 11 }],
      })),
    })

  it('flags short-sentence bullets, not just one- or two-word ones', () => {
    // The reported bug: full short sentences average >4 words and were missed.
    const doc = bulletDoc([
      'Remote work is here to stay.',
      'Supply chains remain fragile.',
      'Inflation persists globally.',
      'Renewable energy is expanding.',
      'Cybersecurity threats are escalating.',
      'Consumer spending is volatile.',
    ])
    expect(analyzeDoc(doc).filter((f) => f.type === 'bulletSprawl').length).toBe(1)
  })

  it('leaves genuinely long, paragraph-like bullets alone', () => {
    const long =
      'This bullet runs on for an entire line and well beyond, the kind of paragraph a table would only turn into one unwieldy cell.'
    expect(analyzeDoc(bulletDoc(Array(6).fill(long)))).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ type: 'bulletSprawl' })]),
    )
  })

  it('detects a list whose bullets are spaced out with blank lines', () => {
    // The reported bug: a wasteful doc puts a blank paragraph between every bullet, which
    // used to break the consecutive-run scan so the list never reached the 5-item threshold.
    const items = [
      'Remote work is here to stay.',
      'Supply chains remain fragile.',
      'Inflation persists globally.',
      'Renewable energy is expanding.',
      'Cybersecurity threats are escalating.',
    ]
    const spaced: DocModel = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: items.flatMap((text, i) => [
        { id: `b${i}`, kind: 'bullet' as const, runs: [{ text, fontSize: 11 }] },
        { id: `gap${i}`, kind: 'normal' as const, runs: [{ text: '', fontSize: 11 }] },
      ]),
    })
    const f = analyzeDoc(spaced).find((x) => x.type === 'bulletSprawl')
    expect(f).toBeDefined()
    // Converting it should remove the bullets and the blank spacers between them (the run
    // ends on the last bullet, so only the trailing blank after the list survives).
    return new MockDocsBackend().apply(spaced, f!.action).then((next) => {
      expect(next.paragraphs.filter((p) => p.kind === 'bullet')).toHaveLength(0)
      const blanks = next.paragraphs.filter((p) => p.runs.every((r) => r.text.trim() === ''))
      expect(blanks.length).toBeLessThanOrEqual(1)
      expect(next.paragraphs.length).toBeLessThan(spaced.paragraphs.length)
    })
  })

  it('detects manually-typed glyph bullets, stripping the glyph from cells', () => {
    const glyph: DocModel = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      // Read path marks these 'bullet'; here we mimic that so the rule is exercised directly.
      paragraphs: ['Alpha team', 'Beta team', 'Gamma team', 'Delta team', 'Omega team'].map(
        (t, i) => ({ id: `g${i}`, kind: 'bullet' as const, runs: [{ text: `• ${t}`, fontSize: 11 }] }),
      ),
    })
    const f = analyzeDoc(glyph).find((x) => x.type === 'bulletSprawl')
    expect(f).toBeDefined()
    expect(f!.action.kind === 'bulletsToTable' && f!.action.rows).toContain('Alpha team')
  })
})

describe('MockDocsBackend.apply', () => {
  it('removes a highlight and adds an underline', async () => {
    const f = typesIn('highlight')[0]
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    const stillHighlighted = next.paragraphs.some((p) =>
      p.runs.some((r) => r.highlightColor),
    )
    expect(stillHighlighted).toBe(false)
    const hasUnderline = next.paragraphs.some((p) => p.runs.some((r) => r.underline))
    expect(hasUnderline).toBe(true)
  })

  it('shrinks an oversized font', async () => {
    const f = typesIn('fontSize')[0]
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    const has18 = next.paragraphs.some((p) => p.runs.some((r) => r.fontSize === 18))
    expect(has18).toBe(false)
  })

  it('collapses blank-line runs to a single blank', async () => {
    const f = typesIn('doubleSpacing')[0]
    const before = SAMPLE_DOC.paragraphs.length
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    expect(next.paragraphs.length).toBeLessThan(before)
  })

  it('converts a page break to a divider paragraph', async () => {
    const f = typesIn('pageBreak')[0]
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    expect(next.paragraphs.some((p) => p.kind === 'pageBreak')).toBe(false)
  })

  it('applies an edited verbose suggestion when overridden', async () => {
    const f = typesIn('verbose')[0]
    const custom = 'Print less.'
    const action = { ...f.action, text: custom } as typeof f.action
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, action)
    expect(next.paragraphs.some((p) => p.runs.some((r) => r.text === custom))).toBe(true)
  })

  it('keeps offsets consistent after an edit', async () => {
    const f = typesIn('fontSize')[0]
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    const last = next.paragraphs[next.paragraphs.length - 1]
    expect(last.end).toBeGreaterThan(last.start!)
  })

  it('collapses a bullet sprawl into a compact grid with fewer paragraphs', async () => {
    const f = typesIn('bulletSprawl')[0]
    const beforeBullets = SAMPLE_DOC.paragraphs.filter((p) => p.kind === 'bullet').length
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    const afterBullets = next.paragraphs.filter((p) => p.kind === 'bullet').length
    expect(afterBullets).toBe(0)
    // The grid uses strictly fewer rows than there were bullets.
    const gridRows = next.paragraphs.filter((p) => p.runs.some((r) => r.text.includes('•')))
    expect(gridRows.length).toBeLessThan(beforeBullets)
    expect(gridRows.length).toBeGreaterThan(0)
  })
})

describe('largeImage detection', () => {
  const imageDoc = (widthPt: number, heightPt: number): DocModel =>
    rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: [
        { id: 'i0', kind: 'normal', runs: [{ text: '', fontSize: 11 }], images: [{ objectId: 'x', widthPt, heightPt }] },
      ],
    })

  it('flags an image covering more than a quarter of the page', () => {
    const f = analyzeDoc(imageDoc(468, 360)).find((x) => x.type === 'largeImage')
    expect(f).toBeDefined()
    expect(f!.action.kind).toBe('resizeImage')
  })

  it('leaves a reasonably sized image alone', () => {
    expect(analyzeDoc(imageDoc(200, 150))).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ type: 'largeImage' })]),
    )
  })

  it('shrinks an oversized image toward the page-area limit', async () => {
    const doc = imageDoc(468, 360)
    const f = analyzeDoc(doc).find((x) => x.type === 'largeImage')!
    const next = await new MockDocsBackend().apply(doc, f.action)
    const img = next.paragraphs[0].images![0]
    expect(img.widthPt).toBeLessThan(468)
    expect(img.heightPt).toBeLessThan(360)
    // No longer large enough to re-flag.
    expect(analyzeDoc(next).some((x) => x.type === 'largeImage')).toBe(false)
  })
})

describe('condenseLocally', () => {
  it('shortens padded phrases', () => {
    const out = condenseLocally('Due to the fact that it rained, we stayed home.')
    expect(out.toLowerCase()).toContain('because')
    expect(out.length).toBeLessThan('Due to the fact that it rained, we stayed home.'.length)
  })

  it('flags only genuinely verbose text', () => {
    expect(looksVerbose('Short and tidy.')).toBe(false)
  })
})

describe('rebuildOffsets', () => {
  it('produces monotonic non-overlapping run offsets', () => {
    const doc: DocModel = rebuildOffsets(JSON.parse(JSON.stringify(SAMPLE_DOC)))
    let prevEnd = -1
    for (const p of doc.paragraphs) {
      expect(p.start!).toBeGreaterThanOrEqual(prevEnd === -1 ? 0 : prevEnd)
      prevEnd = p.end!
    }
  })
})
