import { describe, it, expect } from 'vitest'
import { condenseLocally, condenseWithChanges, looksVerbose } from './condense'

describe('condenseWithChanges (offline, no AI)', () => {
  it('replaces padded phrases with plain ones', () => {
    expect(condenseLocally('We left early due to the fact that it rained.')).toBe(
      'We left early because it rained.',
    )
    expect(condenseLocally('She is able to finish prior to the deadline.')).toBe(
      'She can finish before the deadline.',
    )
    expect(condenseLocally('We will utilize the data in the near future.')).toBe(
      'We will use the data soon.',
    )
  })

  it('keeps a capital when the replaced phrase started a sentence', () => {
    expect(condenseLocally('In order to win, train daily.')).toBe('To win, train daily.')
    expect(condenseLocally('Due to the fact that it rained, we stayed in.')).toBe(
      'Because it rained, we stayed in.',
    )
  })

  it('drops filler openers and capitalizes what follows', () => {
    expect(condenseLocally('It is important to note that the test is on Friday.')).toBe(
      'The test is on Friday.',
    )
    expect(condenseLocally('Needless to say, the result was clear.')).toBe('The result was clear.')
  })

  it('removes doublets and pleonasms', () => {
    expect(condenseLocally('Each and every student read the past history.')).toBe(
      'Each student read the history.',
    )
    expect(condenseLocally('The end result was very unique.')).toBe('The result was unique.')
  })

  it('leaves "very" alone where it carries meaning', () => {
    expect(condenseLocally('Thank you very much.')).toBe('Thank you very much.')
    expect(condenseLocally('The very first step matters.')).toBe('The very first step matters.')
  })

  it('does not touch words that merely contain a phrase', () => {
    // "prior to" must not match inside "priority to".
    expect(condenseLocally('Give priority to safety.')).toBe('Give priority to safety.')
  })

  it('reports every change in reading order', () => {
    const { changes } = condenseWithChanges(
      'In order to save paper, the majority of us print prior to class.',
    )
    expect(changes).toEqual([
      { from: 'In order to', to: 'To' },
      { from: 'the majority of', to: 'most' },
      { from: 'prior to', to: 'before' },
    ])
  })

  it('returns tidy text unchanged', () => {
    const text = 'Short sentences read well. They also print on fewer pages.'
    expect(condenseWithChanges(text)).toEqual({ text, changes: [] })
  })
})

describe('looksVerbose', () => {
  it('ignores short or already-tight paragraphs', () => {
    expect(looksVerbose('Short and tidy.')).toBe(false)
    expect(
      looksVerbose(
        'Our team printed fewer pages this term because we switched to shared digital notes for every class.',
      ),
    ).toBe(false)
  })

  it('flags paragraphs the rewrite can meaningfully shorten', () => {
    expect(
      looksVerbose(
        'It is important to note that due to the fact that a large number of students print on a daily basis, we need to make an effort to cut paper use.',
      ),
    ).toBe(true)
  })
})
