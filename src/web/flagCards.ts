// Renders the list of issue cards shared by the Word file page and the Word add-in. Text from
// the document is only ever written with textContent, never as HTML.

import type { Flag } from '../lib/analyzer/types'

export interface CardOptions {
  onApply: (flag: Flag) => void
  /** Why this fix can't be applied here, or null when it can. */
  unsupported?: (flag: Flag) => string | null
  /** Jump to the issue in the document (the add-in). */
  onShow?: (flag: Flag) => void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function renderFlagCards(flags: Flag[], o: CardOptions): HTMLUListElement {
  const list = el('ul', 'fx-list')
  for (const f of flags) {
    const li = el('li', 'fx-flag')
    li.append(el('h3', undefined, f.title))
    li.append(el('p', 'fx-why', f.explanation))
    if (f.before || f.after) {
      const diff = el('p', 'fx-diff')
      if (f.before) diff.append(el('span', 'fx-before', clip(f.before)))
      if (f.after) diff.append(el('span', 'fx-after', clip(f.after)))
      li.append(diff)
    }
    const why = o.unsupported?.(f) ?? null
    if (why) li.append(el('p', 'fx-unsupported', why))
    const foot = el('div', 'fx-foot')
    if (f.impact.paper >= 0.05) foot.append(el('span', 'fx-saves', `Saves about ${f.impact.paper.toFixed(1)} of a page`))
    const buttons = el('span', 'fx-buttons')
    if (o.onShow) {
      const show = el('button', 'btn btn-quiet', 'Show')
      show.type = 'button'
      show.addEventListener('click', () => o.onShow!(f))
      buttons.append(show)
    }
    if (!why) {
      const apply = el('button', 'btn btn-quiet', 'Apply')
      apply.type = 'button'
      apply.addEventListener('click', () => o.onApply(f))
      buttons.append(apply)
    }
    foot.append(buttons)
    li.append(foot)
    list.append(li)
  }
  return list
}
