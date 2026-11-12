// Deterministic, offline text shortener — the way pre-LLM writing tools (early Grammarly,
// LanguageTool) tightened prose: a curated library of wordy constructions, each with a
// shorter equivalent. No AI, no network, no keys; the same input always gives the same
// output, and every change can be listed for the user.
//
// The rules are deliberately conservative. Each one either swaps a padded phrase for a
// plain one that means the same thing ("due to the fact that" → "because"), removes a
// doublet ("each and every" → "each"), or drops a filler opener that carries no meaning
// ("It is important to note that"). Anything that could change meaning is left out.

/** One rule: a phrase pattern and its shorter replacement ('' = remove). */
type Rule = [pattern: string, replacement: string]

// Plain-language substitutions. Patterns are matched case-insensitively on word boundaries;
// a space inside a pattern matches any run of whitespace.
const PHRASES: Rule[] = [
  // ---- causes and conditions ----
  ['due to the fact that', 'because'],
  ['owing to the fact that', 'because'],
  ['in light of the fact that', 'because'],
  ['in view of the fact that', 'because'],
  ['on the grounds that', 'because'],
  ['for the reason that', 'because'],
  ['by virtue of the fact that', 'because'],
  ['the reason why is that', 'because'],
  ['the reason is because', 'because'],
  ['accounted for by the fact that', 'because'],
  ['despite the fact that', 'although'],
  ['in spite of the fact that', 'although'],
  ['notwithstanding the fact that', 'although'],
  ['regardless of the fact that', 'although'],
  ['in the event that', 'if'],
  ['in the case that', 'if'],
  ['on the condition that', 'if'],
  ['as a result of', 'because of'],
  ['as a consequence of', 'because of'],
  ['the question as to whether', 'whether'],
  ['as to whether', 'whether'],
  ['whether or not', 'whether'],

  // ---- purpose ----
  ['in order to', 'to'],
  ['in order that', 'so'],
  ['so as to', 'to'],
  ['for the purpose of', 'to'],
  ['with the purpose of', 'to'],
  ['in an effort to', 'to'],
  ['in an attempt to', 'to'],
  ['as a means of', 'to'],
  ['with the aim of', 'to'],

  // ---- time ----
  ['at this point in time', 'now'],
  ['at this moment in time', 'now'],
  ['at the present time', 'now'],
  ['at the present moment', 'now'],
  ['at this present time', 'now'],
  ['in this day and age', 'today'],
  ['at that point in time', 'then'],
  ['at that moment in time', 'then'],
  ['at the time when', 'when'],
  ['at such time as', 'when'],
  ['during the time that', 'while'],
  ['during the course of', 'during'],
  ['in the course of', 'during'],
  ['for the duration of', 'during'],
  ['until such time as', 'until'],
  ['in the near future', 'soon'],
  ['at an early date', 'soon'],
  ['in a timely manner', 'promptly'],
  ['on a daily basis', 'daily'],
  ['on a weekly basis', 'weekly'],
  ['on a monthly basis', 'monthly'],
  ['on a yearly basis', 'yearly'],
  ['on an annual basis', 'annually'],
  ['on a regular basis', 'regularly'],
  ['on a frequent basis', 'often'],
  ['on a continual basis', 'continually'],
  ['at all times', 'always'],
  ['prior to', 'before'],
  ['subsequent to', 'after'],
  ['following the conclusion of', 'after'],
  ['as of yet', 'yet'],
  ['period of time', 'period'],

  // ---- quantity ----
  ['a large number of', 'many'],
  ['a great number of', 'many'],
  ['a significant number of', 'many'],
  ['a considerable number of', 'many'],
  ['a small number of', 'a few'],
  ['a great deal of', 'much'],
  ['a large amount of', 'much'],
  ['a sufficient amount of', 'enough'],
  ['a sufficient number of', 'enough'],
  ['an adequate number of', 'enough'],
  ['the majority of', 'most'],
  ['a majority of', 'most'],
  ['in excess of', 'more than'],
  ['in the vicinity of', 'about'],
  ['in the neighborhood of', 'about'],
  ['in the neighbourhood of', 'about'],
  ['each and every', 'each'],
  ['any and all', 'any'],
  ['one and only', 'only'],

  // ---- relation ----
  ['with regard to', 'about'],
  ['with regards to', 'about'],
  ['in regard to', 'about'],
  ['in regards to', 'about'],
  ['with reference to', 'about'],
  ['in reference to', 'about'],
  ['with respect to', 'about'],
  ['in relation to', 'about'],
  ['on the subject of', 'about'],
  ['on the topic of', 'about'],
  ['pertaining to', 'about'],
  ['along the lines of', 'like'],
  ['in a manner similar to', 'like'],
  ['with the exception of', 'except'],
  ['by means of', 'by'],
  ['in the absence of', 'without'],
  ['in very close proximity to', 'near'],
  ['in close proximity to', 'near'],
  ['in the immediate vicinity of', 'near'],
  ['in the process of', ''],

  // ---- ability, and verbs hidden in nouns ----
  ['has the ability to', 'can'],
  ['have the ability to', 'can'],
  ['has the capacity to', 'can'],
  ['have the capacity to', 'can'],
  ['is able to', 'can'],
  ['are able to', 'can'],
  ['is in a position to', 'can'],
  ['are in a position to', 'can'],
  ['is unable to', 'cannot'],
  ['are unable to', 'cannot'],
  ['make a decision', 'decide'],
  ['made a decision', 'decided'],
  ['make an assumption', 'assume'],
  ['come to a conclusion', 'conclude'],
  ['came to a conclusion', 'concluded'],
  ['reach a conclusion', 'conclude'],
  ['reach an agreement', 'agree'],
  ['reached an agreement', 'agreed'],
  ['give consideration to', 'consider'],
  ['take into consideration', 'consider'],
  ['give an indication of', 'indicate'],
  ['provide an explanation of', 'explain'],
  ['provide assistance to', 'help'],
  ['conduct an investigation of', 'investigate'],
  ['conduct an investigation into', 'investigate'],
  ['conduct an analysis of', 'analyze'],
  ['perform an analysis of', 'analyze'],
  ['carry out an analysis of', 'analyze'],
  ['make an improvement to', 'improve'],
  ['make improvements to', 'improve'],
  ['make reference to', 'refer to'],
  ['make mention of', 'mention'],
  ['make use of', 'use'],
  ['makes use of', 'uses'],
  ['made use of', 'used'],
  ['is dependent on', 'depends on'],
  ['are dependent on', 'depend on'],
  ['is dependent upon', 'depends on'],
  ['are dependent upon', 'depend on'],
  ['is indicative of', 'indicates'],
  ['are indicative of', 'indicate'],
  ['has an impact on', 'affects'],
  ['have an impact on', 'affect'],
  ['had an impact on', 'affected'],
  ['has a tendency to', 'tends to'],
  ['have a tendency to', 'tend to'],
  ['is aware of the fact that', 'knows'],
  ['are aware of the fact that', 'know'],
  ['endeavour to make an effort to', 'try to'],
  ['endeavor to make an effort to', 'try to'],
  ['make an effort to', 'try to'],
  ['made an effort to', 'tried to'],
  ['make an attempt to', 'try to'],
  ['endeavour to', 'try to'],
  ['endeavor to', 'try to'],
  ['utilize', 'use'],
  ['utilizes', 'uses'],
  ['utilized', 'used'],
  ['utilizing', 'using'],
  ['utilise', 'use'],
  ['utilises', 'uses'],
  ['utilised', 'used'],
  ['utilising', 'using'],
  ['ask the question', 'ask'],

  // ---- redundant pairs and pleonasms ----
  ['absolutely essential and critically important', 'essential'],
  ['essential and critically important', 'essential'],
  ['absolutely essential', 'essential'],
  ['reduce and cut down on', 'reduce'],
  ['unnecessary and superfluous', 'unnecessary'],
  ['first and foremost', 'first'],
  ['full and complete', 'complete'],
  ['true and accurate', 'accurate'],
  ['basic and fundamental', 'basic'],
  ['null and void', 'void'],
  ['various different', 'various'],
  ['basic fundamentals', 'fundamentals'],
  ['added bonus', 'bonus'],
  ['advance planning', 'planning'],
  ['advance warning', 'warning'],
  ['past history', 'history'],
  ['past experience', 'experience'],
  ['future plans', 'plans'],
  ['end result', 'result'],
  ['final outcome', 'outcome'],
  ['final conclusion', 'conclusion'],
  ['true facts', 'facts'],
  ['free gift', 'gift'],
  ['new innovation', 'innovation'],
  ['joint collaboration', 'collaboration'],
  ['current status', 'status'],
  ['unexpected surprise', 'surprise'],
  ['completely eliminate', 'eliminate'],
  ['repeat again', 'repeat'],
  ['revert back', 'revert'],
  ['return back', 'return'],
  ['still remains', 'remains'],
  ['very unique', 'unique'],
  ['totally unique', 'unique'],
  ['free of charge', 'free'],
  ['whenever and wherever it is at all possible to do so', 'whenever possible'],
  ['wherever and whenever it is at all possible to do so', 'whenever possible'],
  ['whenever it is at all possible', 'whenever possible'],
  ['if at all possible', 'if possible'],
  ['in actual fact', 'in fact'],

  // ---- more padded phrases common in school and office writing ----
  ['a number of', 'several'],
  ['a variety of', 'various'],
  ['a wide variety of', 'many'],
  ['a wide range of', 'many'],
  ['a broad range of', 'many'],
  ['the vast majority of', 'most'],
  ['in the vast majority of cases', 'usually'],
  ['a total of', ''],
  ['for the most part', 'mostly'],
  ['by and large', 'mostly'],
  ['more often than not', 'often'],
  ['to a large extent', 'largely'],
  ['to a great extent', 'largely'],
  ['to a certain extent', 'partly'],
  ['to a certain degree', 'partly'],
  ['at the end of the day', ''],
  ['when all is said and done', ''],
  ['in the final analysis', ''],
  ["in today's society", 'today'],
  ['in modern society', 'today'],
  ['in the modern world', 'today'],
  ['it is a fact that', ''],
  ['it can be seen that', ''],
  ['it is clear that', ''],
  ['it is obvious that', ''],
  ['it is evident that', ''],
  ['there is no doubt that', ''],
  ['as previously mentioned', ''],
  ['as mentioned above', ''],
  ['as mentioned earlier', ''],
  ['as stated above', ''],
  ['in the area of', 'in'],
  ['in the field of', 'in'],
  ['in the realm of', 'in'],
  ['with the result that', 'so'],
  ['is going to', 'will'],
  ['are going to', 'will'],
  ['on account of', 'because of'],
  ['has the potential to', 'could'],
  ['have the potential to', 'could'],
  ['at a later date', 'later'],
  ['at a later time', 'later'],
  ['the way in which', 'how'],
  ['the manner in which', 'how'],
  ['all of the', 'all the'],
  ['both of the', 'both the'],
]

// Openers that add no meaning. Removing one can leave a lower-case sentence start, which
// the post-pass capitalizes. A trailing comma, if any, goes with the phrase.
const FILLER_OPENERS: string[] = [
  'it is important to note that',
  'it is worth noting that',
  'it should be noted that',
  'it must be noted that',
  'it is interesting to note that',
  'it goes without saying that',
  'the fact of the matter is that',
  'needless to say,',
  'as a matter of fact,',
  'for all intents and purposes,',
]

// Filler adverbs, removed only when directly followed by another word. "very" survives in
// fixed phrases where it carries meaning ("the very first", "very much", "very well").
const FILLER_WORDS: RegExp[] = [
  /\b(?:basically|literally|totally)\s+(?=[a-z])/gi,
  // "not really good" and "not actually" mean something different without the filler.
  /(?<!\bnot\s)\b(?:really|actually)\s+(?=[a-z])/gi,
  /\b(?:essentially|extremely|incredibly|definitely|certainly|obviously|honestly|frankly|somewhat)\s+(?=[a-z])/gi,
  /\bsimply\s+(?!put\b)(?=[a-z])/gi,
  // "quite a few", "quite possibly" and the like carry meaning.
  /\bquite\s+(?!a\b|so\b|the\b|some\b|often\b|possibly\b|likely\b|sure\b)(?=[a-z])/gi,
  // Keep "rather than", "or rather" and "would rather".
  /(?<!\bor\s)(?<!\bwould\s)\brather\s+(?!than\b|be\b|not\b)(?=[a-z])/gi,
  /(?<!\bthe\s)\bvery\s+(?!much\b|many\b|few\b|little\b|well\b|best\b|first\b|last\b|same\b|end\b|own\b|beginning\b|least\b|most\b)(?=[a-z])/gi,
]

/** A single rewrite the condenser made, shown to the user so every change is visible. */
export interface Rewrite {
  from: string
  to: string
}

export interface CondenseResult {
  text: string
  changes: Rewrite[]
}

// Sentinel left where a removed phrase started with a capital, so the next word gets the
// capital instead. U+0001 never occurs in document text.
const CAP = '\u0001'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')

// Longest patterns first, so "in very close proximity to" wins over shorter overlaps.
const COMPILED: Array<[RegExp, string]> = [...PHRASES]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([p, r]) => [new RegExp(`\\b${escape(p)}\\b`, 'gi'), r])

const OPENERS: RegExp[] = [...FILLER_OPENERS]
  .sort((a, b) => b.length - a.length)
  // Openers end in a word or a comma; only a word ending needs a trailing \b.
  .map((p) => new RegExp(`\\b${escape(p)}${/\w$/.test(p) ? '\\b' : ''}\\s*`, 'gi'))

/** Carry the original's leading capital onto the replacement. */
function matchCase(original: string, replacement: string): string {
  if (!replacement) return /^[A-Z]/.test(original) ? CAP : ''
  if (/^[A-Z]/.test(original)) return replacement[0].toUpperCase() + replacement.slice(1)
  return replacement
}

/** Condense `input` and report each change, in the order applied. */
export function condenseWithChanges(input: string): CondenseResult {
  const changes: Rewrite[] = []
  let out = input

  const run = (re: RegExp, rep: string) => {
    out = out.replace(re, (m) => {
      const to = matchCase(m, rep)
      changes.push({ from: m.replace(/\s+/g, ' ').trim(), to: to === CAP ? '' : to })
      return to
    })
  }

  for (const re of OPENERS) run(re, '')
  for (const [re, rep] of COMPILED) run(re, rep)
  for (const re of FILLER_WORDS) run(re, '')

  // "the the", "of of": a doubled small word is a typo, not emphasis.
  out = out.replace(/\b(the|a|an|of|in|on|and|for|with)\s+\1\b/gi, (m, w: string) => {
    changes.push({ from: m.replace(/\s+/g, ' '), to: w })
    return w
  })

  out = out
    // A comma left behind by a removed opener goes with it.
    .replace(new RegExp(`${CAP}\\s*,\\s*`, 'g'), CAP)
    .replace(/([.!?])\s*,\s*/g, '$1 ')
    // A removed capitalized opener hands its capital to the next word.
    .replace(new RegExp(`${CAP}\\s*([a-z])`, 'g'), (_, c: string) => c.toUpperCase())
    .replace(new RegExp(CAP, 'g'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*,\s*/, '')
    .trim()
  // A sentence the rewrite left starting in lower case gets its capital back.
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase())

  // Rules run longest-first; list the changes in reading order instead.
  // A sentence the text says twice is said once.
  const deduped = dropRepeatedSentences(out)
  out = deduped.text
  for (const sentence of deduped.dropped) changes.push({ from: sentence, to: '' })

  const lower = input.replace(/\s+/g, ' ').toLowerCase()
  const at = (r: Rewrite) => {
    const i = lower.indexOf(r.from.toLowerCase())
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  changes.sort((a, b) => at(a) - at(b))

  return { text: out, changes }
}

/** The condensed text only. */
export function condenseLocally(input: string): string {
  return condenseWithChanges(input).text
}

// ---------------------------------------------------------------------------
// Sentence-level shortening. Phrase swaps only help text that uses stock phrases; padded
// student and office prose is usually just long. These steps work on whole sentences.
// ---------------------------------------------------------------------------

const ABBREVIATION = /(?:\b(?:e\.g|i\.e|etc|vs|cf|Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|Fig|approx|No)|\b[A-Z])\.$/

/** Split prose into sentences. Abbreviations like "e.g." and "Dr." don't end one. */
export function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?]["')\]]?)\s+(?=["'(\[]?[A-Z0-9])/)
  const out: string[] = []
  for (const part of raw) {
    const prev = out[out.length - 1]
    if (prev !== undefined && ABBREVIATION.test(prev)) out[out.length - 1] = `${prev} ${part}`
    else out.push(part)
  }
  return out.map((x) => x.trim()).filter(Boolean)
}

const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by for from had has have he her his i if in into is it its ' +
    'me my no not of on or our she so than that the their them then there these they this to ' +
    'was we were what when which who will with would you your can could should also very more ' +
    'most such some any each other about over under after before while because just than'
  ).split(' '),
)

/** The meaningful words of a sentence, lower-cased. */
function contentWords(sentence: string): string[] {
  return (sentence.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter(
    (w) => w.length > 2 && !STOPWORDS.has(w),
  )
}

const overlap = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / (a.size + b.size - shared)
}

/** Remove a sentence that repeats an earlier one, word for word or very nearly. */
export function dropRepeatedSentences(text: string): { text: string; dropped: string[] } {
  const sentences = splitSentences(text)
  if (sentences.length < 2) return { text, dropped: [] }
  const kept: string[] = []
  const keptWords: Set<string>[] = []
  const dropped: string[] = []
  for (const sentence of sentences) {
    const words = new Set(contentWords(sentence))
    const norm = sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const repeat = kept.some(
      (k, i) =>
        k.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === norm ||
        (words.size >= 6 && keptWords[i].size >= 6 && overlap(words, keptWords[i]) >= 0.85),
    )
    if (repeat) dropped.push(sentence)
    else {
      kept.push(sentence)
      keptWords.push(words)
    }
  }
  return dropped.length ? { text: kept.join(' '), dropped } : { text, dropped: [] }
}

/** Long paragraphs only: below this the sentence-dropping pass stays out of the way. */
const TRIM_MIN_WORDS = 90
const TRIM_MIN_SENTENCES = 5
/** Aim to keep about this share of the words, and never cut more than the floor allows. */
const TRIM_TARGET = 0.75
const TRIM_FLOOR = 0.62
/** Not worth suggesting unless at least this share of the words goes. */
const TRIM_MIN_SAVING = 0.15

/**
 * Shorten a very long paragraph by leaving out its least important sentences. Sentences
 * that carry the paragraph's recurring words rank highest, the first and last sentence
 * always stay, and a sentence that mostly repeats a kept one goes first. The result keeps the
 * original order. Because this removes whole sentences it is only ever offered as a
 * suggestion to review, never applied automatically.
 */
export function shortenLongText(text: string): { text: string; dropped: string[] } | null {
  const sentences = splitSentences(text)
  const total = countWords(text)
  if (sentences.length < TRIM_MIN_SENTENCES || total < TRIM_MIN_WORDS) return null

  const words = sentences.map((s) => countWords(s))
  const content = sentences.map(contentWords)
  const sets = content.map((c) => new Set(c))
  // How many sentences each word appears in: words that recur are what the paragraph is about.
  const spread = new Map<string, number>()
  for (const set of sets) for (const w of set) spread.set(w, (spread.get(w) ?? 0) + 1)

  const score = content.map((ws, i) => {
    if (ws.length === 0) return 0
    const topical = ws.reduce((sum, w) => sum + ((spread.get(w) ?? 1) - 1), 0) / Math.sqrt(ws.length)
    const repeatsEarlier = sets.slice(0, i).some((earlier) => overlap(sets[i], earlier) >= 0.6)
    return repeatsEarlier ? topical * 0.4 : topical
  })

  const keep = sentences.map(() => true)
  let remaining = total
  let kept = sentences.length
  const limit = Math.ceil(total * TRIM_TARGET)
  const droppable = sentences
    .map((_, i) => i)
    .filter((i) => i > 0 && i < sentences.length - 1)
    .sort((a, b) => score[a] - score[b] || b - a)
  for (const i of droppable) {
    if (remaining <= limit || kept <= 3) break
    if (remaining - words[i] < total * TRIM_FLOOR) continue
    keep[i] = false
    remaining -= words[i]
    kept--
  }
  if (total - remaining < total * TRIM_MIN_SAVING) return null
  return {
    text: sentences.filter((_, i) => keep[i]).join(' '),
    dropped: sentences.filter((_, i) => !keep[i]),
  }
}

/** What the offline rewrite suggests for a paragraph, and how it got there. */
export interface Wordiness {
  text: string
  changes: Rewrite[]
  /** true when whole sentences were left out, so the suggestion needs a careful read. */
  trimmed: boolean
  /** How many whole sentences the trim left out (not counting repeats). */
  sentencesLeftOut: number
  wordsBefore: number
  wordsAfter: number
}

/**
 * The offline rewrite of a paragraph: padded phrases and filler out, repeated sentences
 * out, and, for very long paragraphs, the least important sentences out as well. Returns
 * null when the paragraph isn't wordy enough to be worth a card: at least 12 words, and
 * the rewrite saves 10% of the text or 30 characters (about a third of a printed line).
 */
export function analyzeWordiness(input: string): Wordiness | null {
  const wordsBefore = countWords(input)
  if (wordsBefore < 12) return null
  const base = condenseWithChanges(input)
  let text = base.text
  let changes = base.changes
  let trimmed = false
  const trim = shortenLongText(text)
  if (trim) {
    text = trim.text
    changes = [...changes, ...trim.dropped.map((from) => ({ from, to: '' }))]
    trimmed = true
  }
  const saved = input.length - text.length
  if (!(saved >= 30 || saved >= input.length * 0.1)) return null
  return { text, changes, trimmed, sentencesLeftOut: trim?.dropped.length ?? 0, wordsBefore, wordsAfter: countWords(text) }
}

/** Is this paragraph worth a "wordy paragraph" card? */
export function looksVerbose(text: string): boolean {
  return analyzeWordiness(text) !== null
}
