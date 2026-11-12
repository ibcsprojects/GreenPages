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

  out = out
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
  const lower = input.replace(/\s+/g, ' ').toLowerCase()
  changes.sort((a, b) => lower.indexOf(a.from.toLowerCase()) - lower.indexOf(b.from.toLowerCase()))

  return { text: out, changes }
}

/** The condensed text only. */
export function condenseLocally(input: string): string {
  return condenseWithChanges(input).text
}

/**
 * Is this paragraph worth a "wordy paragraph" card? Only when the offline rewrite trims a
 * meaningful amount: 10% of the text, or 30+ characters (about a third of a printed line).
 */
export function looksVerbose(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length < 12) return false
  const saved = text.length - condenseLocally(text).length
  return saved >= 30 || saved >= text.length * 0.1
}
