// Scripts for the homepage: the "paste your text" tool in the hero, and the example issue
// cards further down. Both run the same offline code the extension uses, so what visitors
// see is real output, not a mock-up. Nothing typed here ever leaves the page, and text is
// only ever written to the page with textContent, never as HTML.

import { analyzeDoc } from '../lib/analyzer/rules'
import { analyzeWordiness, condenseWithChanges, type Rewrite } from '../lib/analyzer/condense'
import { SAMPLE_DOC } from '../lib/docModel'
import { renderFlagCards } from './flagCards'
import { mountDemos } from './demos'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

// ---------------------------------------------------------------------------
// Example issue cards: real flags from running the analyzer on the sample document.
// ---------------------------------------------------------------------------

function mountExamples(): void {
  const flags = analyzeDoc(SAMPLE_DOC)
  document.querySelectorAll<HTMLElement>('[data-flag-types]').forEach((slot) => {
    const wanted = (slot.dataset.flagTypes ?? '').split(',').map((t) => t.trim())
    const picked = wanted.flatMap((t) => flags.filter((f) => f.type === t).slice(0, 1))
    if (picked.length === 0) return
    slot.replaceChildren(renderFlagCards(picked, { onApply: () => {}, readonly: true }))
  })
  document.querySelectorAll<HTMLElement>('[data-issue-count]').forEach((n) => {
    n.textContent = plural(flags.length, 'issue') + ' found'
  })
  mountDemos(flags, SAMPLE_DOC)
}

// ---------------------------------------------------------------------------
// The paste-your-text tool.
// ---------------------------------------------------------------------------

const EXAMPLE_TEXT = [
  'Our school is really committed to reducing waste. We are actually quite proud of the extremely good progress we have made, and we definitely want to keep going because it is basically the right thing to do for everyone.',
  'Paper is used in almost every school across the country and the amount that gets used is much larger than most people would ever imagine. Every year schools print millions of pages of worksheets, handouts, reports and notices, and a surprising share of those pages is thrown away after a single use. The cost of all this paper is not only financial, because making paper takes trees, water and a great deal of energy. Water is needed at nearly every stage of making paper, from the pulp to the finished sheets. Some schools have started to count how many pages each department prints, and a few of them have found that showing the numbers is enough to change habits. Printing on both sides of the sheet is one of the easiest changes, and it can cut paper use by close to half. Reducing margins, choosing a smaller font and removing blank pages also help to save paper without making documents harder to read. In the end the best way to cut paper waste is to think before printing and to check each document for pages that are not needed.',
].join('\n\n')

/** About how many characters fit on a printed page: 90 per line, 46 lines. */
const CHARS_PER_PAGE = 90 * 46

interface Piece {
  /** The text as typed. */
  original: string
  /** What it becomes. Equal to `original` when nothing was found. */
  shorter: string
  changes: Rewrite[]
  trimmed: boolean
  sentencesLeftOut: number
  wordsBefore: number
  wordsAfter: number
}

interface Result {
  pieces: Piece[]
  shorter: string
  wordsBefore: number
  wordsAfter: number
  charsSaved: number
}

/** Check each paragraph of `input` on its own, keeping the blank lines between them. */
function check(input: string, includeTrim: boolean): Result {
  const parts = input.split(/(\n+)/)
  const pieces: Piece[] = []
  let shorter = ''
  for (const part of parts) {
    if (part === '' || /^\n+$/.test(part)) {
      shorter += part
      continue
    }
    const wordsBefore = countWords(part)
    let found: Piece | null = null
    if (includeTrim) {
      const w = analyzeWordiness(part)
      if (w) {
        found = {
          original: part, shorter: w.text, changes: w.changes, trimmed: w.trimmed,
          sentencesLeftOut: w.sentencesLeftOut, wordsBefore: w.wordsBefore, wordsAfter: w.wordsAfter,
        }
      }
    } else if (wordsBefore >= 12) {
      const c = condenseWithChanges(part)
      if (c.text.length < part.length) {
        found = {
          original: part, shorter: c.text, changes: c.changes, trimmed: false,
          sentencesLeftOut: 0, wordsBefore, wordsAfter: countWords(c.text),
        }
      }
    }
    if (found) pieces.push(found)
    shorter += found ? found.shorter : part
  }
  return {
    pieces,
    shorter,
    wordsBefore: countWords(input),
    wordsAfter: countWords(shorter),
    charsSaved: input.length - shorter.length,
  }
}

function mountTool(): void {
  const input = document.querySelector<HTMLTextAreaElement>('#try-input')
  const out = document.querySelector<HTMLElement>('#try-output')
  const words = document.querySelector<HTMLElement>('#try-words')
  const example = document.querySelector<HTMLButtonElement>('#try-example')
  if (!input || !out || !words || !example) return

  let includeTrim = true
  let timer = 0

  const empty = () => {
    const box = el('div', 'try-empty')
    box.append(el('strong', undefined, 'Ready to start?'), el('span', undefined, 'Type or paste your text to check it.'))
    out.replaceChildren(box)
  }

  const render = () => {
    const text = input.value
    words.textContent = plural(countWords(text), 'word')
    if (text.trim() === '') return empty()

    const r = check(text, includeTrim)
    const frag = document.createDocumentFragment()

    if (r.pieces.length === 0) {
      const ok = el('div', 'try-empty')
      ok.append(
        el('strong', undefined, 'Nothing to cut'),
        el('span', undefined, 'This text is already tight. SparePage looks for padded phrases, filler words, repeated sentences and very long paragraphs.'),
      )
      frag.append(ok)
    } else {
      const summary = el('div', 'try-summary')
      summary.append(
        el('strong', undefined, `${r.wordsBefore} words → ${r.wordsAfter} words`),
        el(
          'span',
          undefined,
          r.charsSaved / CHARS_PER_PAGE >= 0.05
            ? `About ${(r.charsSaved / CHARS_PER_PAGE).toFixed(1)} of a printed page saved`
            : 'A small saving, but it adds up across a document',
        ),
      )
      frag.append(summary)

      r.pieces.forEach((p, i) => {
        const card = el('section', 'try-card')
        const head = el('h3', undefined, `Paragraph ${r.pieces.length > 1 ? i + 1 : ''}`.trim())
        head.append(el('span', undefined, `${p.wordsBefore} → ${p.wordsAfter} words`))
        card.append(head)
        if (p.trimmed) {
          card.append(
            el(
              'p',
              'try-warn',
              `Leaves out ${plural(p.sentencesLeftOut, 'sentence')} to keep the main points. Read it before you use it.`,
            ),
          )
        }
        const list = el('ul', 'try-changes')
        for (const c of p.changes.slice(0, 12)) {
          const li = el('li')
          li.append(el('s', undefined, c.from.length > 70 ? `${c.from.slice(0, 69)}…` : c.from))
          li.append(c.to ? el('b', undefined, ` ${c.to}`) : el('em', undefined, ' (cut)'))
          list.append(li)
        }
        if (p.changes.length > 12) list.append(el('li', 'try-more', `and ${p.changes.length - 12} more`))
        card.append(list)
        const more = el('details', 'try-shorter')
        more.append(el('summary', undefined, 'Show the shorter paragraph'), el('p', undefined, p.shorter))
        card.append(more)
        frag.append(card)
      })
    }

    // Controls
    const bar = el('div', 'try-bar')
    const trimLabel = el('label', 'try-check')
    const box = el('input')
    box.type = 'checkbox'
    box.checked = includeTrim
    box.addEventListener('change', () => {
      includeTrim = box.checked
      render()
    })
    trimLabel.append(box, el('span', undefined, 'Also shorten very long paragraphs'))
    bar.append(trimLabel)
    if (r.pieces.length > 0) {
      const copy = el('button', 'btn btn-primary btn-sm', 'Copy shorter text')
      copy.type = 'button'
      copy.addEventListener('click', () => {
        void navigator.clipboard
          ?.writeText(r.shorter)
          .then(() => (copy.textContent = 'Copied'))
          .catch(() => (copy.textContent = 'Press Ctrl+C to copy'))
      })
      const use = el('button', 'btn btn-quiet btn-sm', 'Use shorter text')
      use.type = 'button'
      use.addEventListener('click', () => {
        input.value = r.shorter
        render()
      })
      bar.append(copy, use)
    }
    frag.append(bar)
    out.replaceChildren(frag)
  }

  input.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(render, 200)
  })
  example.addEventListener('click', () => {
    input.value = EXAMPLE_TEXT
    render()
    input.focus()
  })
  empty()
}

mountExamples()
mountTool()
