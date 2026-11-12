import { describe, it, expect } from 'vitest'
import { revealQuery } from './revealQuery'

const range = (text: string, needle: string) => {
  const start = text.indexOf(needle)
  return { start, end: start + needle.length }
}

describe('revealQuery', () => {
  it('searches for the start of the flagged text', () => {
    const text = 'Intro line.\nThe quarterly figures were reviewed by the whole committee.\nOutro.'
    const r = range(text, 'The quarterly figures were reviewed by the whole committee.')
    expect(revealQuery(text, r)).toEqual({
      query: 'The quarterly figures were reviewed by the whole committee',
      exact: true,
    })
  })

  it('keeps a long run to a short query cut at a word boundary', () => {
    const long = 'word '.repeat(80).trim()
    const q = revealQuery(long, { start: 0, end: long.length })!
    expect(q.exact).toBe(true)
    expect(q.query.length).toBeLessThanOrEqual(60)
    expect(q.query.endsWith('word')).toBe(true)
  })

  it('ignores the trailing line break that Docs puts on a run', () => {
    const text = 'Body paragraph at fourteen points.\n'
    expect(revealQuery(text, { start: 0, end: text.length })?.query).toBe('Body paragraph at fourteen points')
  })

  it('does not search across line breaks or tabs', () => {
    const text = 'First short line\nSecond line is the longer one here\tand a tab'
    const q = revealQuery(text, { start: 0, end: text.length })!
    expect(q.query).not.toMatch(/[\n\t]/)
    // The first stretch long enough to be distinctive, so the match lands at the span's start.
    expect(q.query).toBe('First short line')
  })

  it('turns non-breaking spaces into plain spaces', () => {
    const text = 'Plain text with odd spaces'
    expect(revealQuery(text, { start: 0, end: text.length })?.query).toBe('Plain text with odd spaces')
  })

  it('stops at quotes, symbols and image placeholders that Find may not match', () => {
    const text = 'She said “hello” and this longer stretch carries on  after'
    const q = revealQuery(text, { start: 0, end: text.length })!
    expect(q.query).toBe('and this longer stretch carries on')
  })

  it('anchors on the text above when the span has no text (blank lines)', () => {
    const text = 'A closing sentence before the gap.\n\n\n\nNext section starts here.'
    const start = text.indexOf('\n\n\n\n') + 1
    const q = revealQuery(text, { start, end: start + 3 })!
    expect(q.exact).toBe(false)
    expect(q.query).toBe('A closing sentence before the gap')
  })

  it('falls back to the text below when nothing is above', () => {
    const text = '\n\nFirst real words on the page.'
    const q = revealQuery(text, { start: 0, end: 2 })!
    expect(q).toEqual({ query: 'First real words on the page', exact: false })
  })

  it('returns null when the document has no searchable text at all', () => {
    expect(revealQuery('\n\n\n', { start: 0, end: 2 })).toBeNull()
    expect(revealQuery('', { start: 0, end: 0 })).toBeNull()
  })
})
