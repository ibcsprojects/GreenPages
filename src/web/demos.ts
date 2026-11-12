// Small looping demos for the feature rows on the homepage: a bit of document with the
// problem, the issue card appears, Apply is pressed, and the document changes. The content
// comes from the analyzer's real output on the sample document, so each demo shows what
// SparePage actually does to that text.
//
// Motion rules: transform and opacity only, every movement under 300ms and eased out, the
// loop runs only while the row is on screen, and anyone who prefers reduced motion gets the
// "after" state with no animation at all.

// Framer Motion's mini animator runs on the browser's Web Animations API, which keeps this
// page light. It covers everything here: opacity and transform.
import { animate } from 'framer-motion/dom/mini'
import type { Flag } from '../lib/analyzer/types'
import { flatten, paragraphText, type DocModel } from '../lib/docModel'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

type Frames = { opacity?: [number, number]; transform?: [string, string] }

/** One eased-out movement. The end values are written to the element afterwards, so nothing
 *  snaps back when the animation finishes. */
async function tween(e: HTMLElement, frames: Frames, duration: number): Promise<void> {
  await animate(e, frames, { duration, ease: 'easeOut' })
  if (frames.opacity) e.style.opacity = String(frames.opacity[1])
  if (frames.transform) e.style.transform = frames.transform[1]
}
const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 12))}…`
}

/** The two states of a demo, stacked in one grid cell so the box never changes size. */
interface Stage {
  root: HTMLElement
  before: HTMLElement
  after: HTMLElement
  /** An element that shrinks into place as the "after" state appears (the image demo). */
  zoom?: HTMLElement
}

function stage(before: Node[], after: Node[], zoom?: HTMLElement): Stage {
  const root = el('div', 'demo-stage')
  const b = el('div', 'demo-before')
  const a = el('div', 'demo-after')
  b.append(...before)
  a.append(...after)
  root.append(b, a)
  return { root, before: b, after: a, zoom }
}

/** The paragraph that contains `offset`, and where it starts in the flat text. */
function paragraphAt(doc: DocModel, offset: number) {
  const i = doc.paragraphs.findIndex((p) => p.start! <= offset && offset <= p.end!)
  return { index: i, para: doc.paragraphs[i] }
}

/** Nearest paragraph with text before (step -1) or after (step 1) paragraph `from`. */
function textNear(doc: DocModel, from: number, step: 1 | -1): string {
  for (let i = from + step; i >= 0 && i < doc.paragraphs.length; i += step) {
    const t = paragraphText(doc.paragraphs[i]).trim()
    if (t) return t
  }
  return ''
}

/** A paragraph with one span of it wrapped in an element of class `cls`. */
function withSpan(text: string, start: number, end: number, cls: string): Node[] {
  const pre = text.slice(Math.max(0, start - 70), start)
  const post = text.slice(end, end + 70)
  return [
    document.createTextNode(`${start > 70 ? '…' : ''}${pre}`),
    el('span', cls, text.slice(start, end).trim()),
    document.createTextNode(`${post}${end + 70 < text.length ? '…' : ''}`),
  ]
}

type Builder = (flag: Flag, doc: DocModel, full: string) => Stage | null

const BUILDERS: Record<string, Builder> = {
  highlight(flag, doc) {
    const { para } = paragraphAt(doc, flag.range.start)
    if (!para) return null
    const text = paragraphText(para)
    const s = flag.range.start - para.start!
    const e = flag.range.end - para.start!
    const p = (cls: string) => {
      const line = el('p', 'demo-text')
      line.append(...withSpan(text, s, e, cls))
      return line
    }
    return stage([p('demo-hl')], [p('demo-u')])
  },

  fontSize(flag, _doc, full) {
    const text = clip(full.slice(flag.range.start, flag.range.end), 120)
    const from = flag.action.kind === 'setFontSize' ? flag.action.from : 18
    const to = flag.action.kind === 'setFontSize' ? flag.action.to : 11
    const make = (pt: number, cls: string) => {
      const box = el('div')
      box.append(el('span', 'demo-badge', `${pt} pt`), el('p', `demo-text ${cls}`, text))
      return box
    }
    return stage([make(from, 'demo-big')], [make(to, 'demo-small')])
  },

  doubleSpacing(flag, doc) {
    const { index } = paragraphAt(doc, flag.range.start)
    const above = clip(textNear(doc, index, -1), 90)
    const end = paragraphAt(doc, flag.range.end).index
    const below = clip(textNear(doc, end, 1), 90)
    const count = Number(/^(\d+)/.exec(flag.title)?.[1] ?? 3)
    const page = (blanks: number) => {
      const nodes: Node[] = [el('p', 'demo-text', above)]
      for (let i = 0; i < blanks; i++) nodes.push(el('div', 'demo-blank', '¶'))
      nodes.push(el('p', 'demo-text', below))
      return nodes
    }
    return stage(page(count), page(1))
  },

  bulletSprawl(flag) {
    if (flag.action.kind !== 'bulletsToTable') return null
    const rows = flag.action.rows.slice(0, 8).map((r) => clip(r, 28))
    const list = el('ul', 'demo-list')
    for (const r of rows) list.append(el('li', undefined, r))
    const table = el('div', 'demo-table')
    for (const r of rows) table.append(el('span', undefined, r))
    return stage([list], [table])
  },

  verbose(flag, _doc, full) {
    const original = full.slice(flag.range.start, flag.range.end).trim()
    const shorter = (flag.editableSuggestion ?? '').trim()
    if (!shorter) return null
    // Mark each phrase the rewrite changed, in reading order, in the original.
    const before = el('p', 'demo-text demo-prose')
    let at = 0
    const lower = original.toLowerCase()
    for (const r of flag.rewrites ?? []) {
      const i = lower.indexOf(r.from.toLowerCase().replace(/…$/, ''), at)
      if (i < 0) continue
      const len = r.from.replace(/…$/, '').length
      before.append(document.createTextNode(original.slice(at, i)), el('span', 'demo-cut', original.slice(i, i + len)))
      at = i + len
    }
    before.append(document.createTextNode(original.slice(at)))
    const count = (t: string) => t.split(/\s+/).filter(Boolean).length
    const b = el('div')
    b.append(before, el('p', 'demo-count', `${count(original)} words`))
    const a = el('div')
    a.append(el('p', 'demo-text demo-prose', shorter), el('p', 'demo-count', `${count(shorter)} words`))
    return stage([b], [a])
  },

  largeImage(flag, doc) {
    const { index } = paragraphAt(doc, flag.range.start)
    const caption = clip(textNear(doc, index, 1), 80)
    const big = el('div', 'demo-img', 'Image')
    const small = el('div', 'demo-img demo-img-small', 'Image')
    return stage([big, el('p', 'demo-text', caption)], [small, el('p', 'demo-text', caption)], small)
  },
}

/** Show the end state, no motion (reduced-motion users, and the moment before a loop starts). */
function showAfter(s: Stage, card: HTMLElement, chip: HTMLElement): void {
  s.before.style.opacity = '0'
  s.after.style.opacity = '1'
  card.style.opacity = '1'
  card.style.transform = 'none'
  chip.classList.add('is-pressed')
}

function makeLoop(s: Stage, card: HTMLElement, chip: HTMLElement) {
  let run = 0

  const reset = () => {
    s.before.style.opacity = '1'
    s.after.style.opacity = '0'
    s.after.style.transform = 'none'
    if (s.zoom) s.zoom.style.transform = 'none'
    card.style.opacity = '0'
    card.style.transform = 'translateY(10px)'
    chip.classList.remove('is-pressed')
  }

  async function play(id: number) {
    const alive = () => id === run
    while (alive()) {
      reset()
      await wait(700)
      if (!alive()) return
      // The issue card appears.
      await tween(card, { opacity: [0, 1], transform: ['translateY(10px)', 'none'] }, 0.22)
      await wait(1100)
      if (!alive()) return
      // Apply is pressed.
      await tween(chip, { transform: ['scale(1)', 'scale(0.94)'] }, 0.12)
      chip.classList.add('is-pressed')
      await tween(chip, { transform: ['scale(0.94)', 'none'] }, 0.14)
      if (!alive()) return
      // The document changes.
      void tween(s.before, { opacity: [1, 0] }, 0.18)
      if (s.zoom) void tween(s.zoom, { transform: ['scale(1.5)', 'none'] }, 0.26)
      await tween(s.after, { opacity: [0, 1], transform: ['translateY(6px)', 'none'] }, 0.26)
      await wait(2400)
      if (!alive()) return
      // Back to the start.
      void tween(card, { opacity: [1, 0] }, 0.2)
      void tween(s.after, { opacity: [1, 0] }, 0.2)
      await tween(s.before, { opacity: [0, 1] }, 0.24)
      await wait(500)
    }
  }

  return {
    start: () => void play(++run),
    stop: () => {
      run++
    },
  }
}

/** Add a demo above the example card in each feature row that has a builder. */
export function mountDemos(flags: Flag[], doc: DocModel): void {
  const full = flatten(doc)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.querySelectorAll<HTMLElement>('.feature-visual[data-flag-types]').forEach((visual) => {
    const type = (visual.dataset.flagTypes ?? '').split(',')[0].trim()
    const flag = flags.find((f) => f.type === type)
    const build = BUILDERS[type]
    const card = visual.querySelector<HTMLElement>('.fx-flag')
    if (!flag || !build || !card) return
    const s = build(flag, doc, full)
    if (!s) return

    const page = el('div', 'demo-doc')
    page.setAttribute('aria-hidden', 'true') // the card below says the same thing in words
    page.append(s.root)
    const chip = el('span', 'demo-apply', 'Apply')
    chip.setAttribute('aria-hidden', 'true')
    const foot = el('div', 'demo-foot')
    foot.append(chip)
    card.append(foot)
    visual.prepend(page)
    visual.classList.add('has-demo')

    showAfter(s, card, chip)
    if (reduced) return
    const loop = makeLoop(s, card, chip)
    let playing = false
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !playing) {
          playing = true
          loop.start()
        } else if (!entry.isIntersecting && playing) {
          playing = false
          loop.stop()
          showAfter(s, card, chip)
        }
      },
      { threshold: 0.4 },
    ).observe(visual)
  })
}
