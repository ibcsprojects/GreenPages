import { describe, it, expect } from 'vitest'
import {
  analyzeWordiness,
  condenseLocally,
  condenseWithChanges,
  dropRepeatedSentences,
  looksEnglish,
  looksVerbose,
  shortenLongText,
  splitSentences,
} from './condense'

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

describe('filler words and padded openers', () => {
  it('removes filler adverbs that add no meaning', () => {
    expect(condenseLocally('This is really important and extremely useful.')).toBe('This is important and useful.')
    expect(condenseLocally('We definitely want to keep going.')).toBe('We want to keep going.')
  })

  it('keeps the words where removing them changes the meaning', () => {
    expect(condenseLocally('It was not really good.')).toBe('It was not really good.')
    expect(condenseLocally('She chose tea rather than coffee.')).toBe('She chose tea rather than coffee.')
    expect(condenseLocally('There were quite a few people there.')).toBe('There were quite a few people there.')
  })

  it('cuts the padded phrases common in school and office writing', () => {
    expect(condenseLocally('A number of students took part.')).toBe('Several students took part.')
    expect(condenseLocally('At the end of the day, the plan worked.')).toBe('The plan worked.')
    expect(condenseLocally('The group is going to meet on Friday.')).toBe('The group will meet on Friday.')
  })

  it('collapses a doubled small word', () => {
    expect(condenseLocally('We went to the the shop.')).toBe('We went to the shop.')
  })
})

describe('sentence-level shortening', () => {
  it('splits sentences without breaking on abbreviations', () => {
    expect(splitSentences('Use e.g. a ruler. Dr. Lee agreed. It works!')).toEqual([
      'Use e.g. a ruler.',
      'Dr. Lee agreed.',
      'It works!',
    ])
  })

  it('drops a sentence the text says twice', () => {
    const r = dropRepeatedSentences('Paper is useful. We should save it. Paper is useful. Thank you.')
    expect(r.text).toBe('Paper is useful. We should save it. Thank you.')
    expect(r.dropped).toEqual(['Paper is useful.'])
  })

  it('does not treat two different sentences as repeats', () => {
    const t = 'The cat chased the mouse across the kitchen floor. The mouse escaped through the small hole.'
    expect(dropRepeatedSentences(t).dropped).toEqual([])
  })

  const LONG = [
    'Paper is used in almost every school across the country and the amount that gets used is much larger than most people would ever imagine.',
    'Every year schools print millions of pages of worksheets, handouts, reports and notices, and a surprising share of those pages is thrown away after a single use.',
    'The cost of all this paper is not only financial, because making paper takes trees, water and a great deal of energy.',
    'Water is needed at nearly every stage of making paper, from the pulp to the finished sheets.',
    'Some schools have started to count how many pages each department prints, and a few of them have found that showing the numbers is enough to change habits.',
    'Printing on both sides of the sheet is one of the easiest changes, and it can cut paper use by close to half.',
    'Reducing margins, choosing a smaller font and removing blank pages also help to save paper without making documents harder to read.',
    'In the end the best way to cut paper waste is to think before printing and to check each document for pages that are not needed.',
  ].join(' ')

  it('shortens a very long paragraph, keeping order and its first and last sentences', () => {
    const r = shortenLongText(LONG)!
    expect(r).not.toBeNull()
    const sentences = splitSentences(LONG)
    const kept = splitSentences(r.text)
    expect(kept[0]).toBe(sentences[0])
    expect(kept[kept.length - 1]).toBe(sentences[sentences.length - 1])
    expect(kept.length + r.dropped.length).toBe(sentences.length)
    // Order is preserved.
    expect(kept.map((k) => sentences.indexOf(k))).toEqual([...kept.map((k) => sentences.indexOf(k))].sort((a, b) => a - b))
    const words = (t: string) => t.split(/\s+/).length
    expect(words(r.text)).toBeLessThan(words(LONG) * 0.85)
    expect(words(r.text)).toBeGreaterThan(words(LONG) * 0.5)
  })

  it('leaves short paragraphs alone', () => {
    expect(shortenLongText('One sentence. Two sentences. Three sentences. Four sentences. Five sentences.')).toBeNull()
  })

  it('analyzeWordiness reports the trim and the word counts', () => {
    const w = analyzeWordiness(LONG)!
    expect(w.trimmed).toBe(true)
    expect(w.sentencesLeftOut).toBeGreaterThan(0)
    expect(w.wordsAfter).toBeLessThan(w.wordsBefore)
  })

  it('analyzeWordiness stays quiet on tight writing', () => {
    expect(analyzeWordiness('The meeting starts at nine. Bring your laptop and the report.')).toBeNull()
    expect(analyzeWordiness('Too short.')).toBeNull()
  })

  it('flags a filler-heavy paragraph even when it is not long', () => {
    const w = analyzeWordiness(
      'Our school is really committed to reducing waste. We are actually quite proud of the extremely good progress we have made, and we definitely want to keep going because it is basically the right thing to do for everyone.',
    )!
    expect(w.trimmed).toBe(false)
    expect(w.wordsAfter).toBeLessThan(w.wordsBefore)
  })
})

describe('English-only guard', () => {
  const english =
    'Our school is really committed to reducing waste and we are actually proud of the extremely good progress that we have made this year.'
  const spanish =
    'Nuestra escuela está muy comprometida con la reducción de los residuos y estamos orgullosos del buen progreso que hemos hecho durante este año escolar.'
  const french =
    "Notre école est très engagée dans la réduction des déchets et nous sommes fiers des progrès que nous avons réalisés au cours de cette année scolaire."

  it('recognises English and other languages', () => {
    expect(looksEnglish(english)).toBe(true)
    expect(looksEnglish(spanish)).toBe(false)
    expect(looksEnglish(french)).toBe(false)
  })

  it('treats text too short to judge as English', () => {
    expect(looksEnglish('Bonjour tout le monde')).toBe(true)
  })

  it('leaves non-English paragraphs alone', () => {
    expect(analyzeWordiness(spanish)).toBeNull()
    expect(analyzeWordiness(english)).not.toBeNull()
  })
})
