// The Word task pane: scan the open document, list the issues, jump to one, fix what can be
// fixed exactly. Fixes the add-in API can't do safely point to the Word file tool.

import { renderFlagCards } from '../web/flagCards'
import { WordSession } from './wordSession'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const summary = $('summary')
const status = $('status')
const actions = $('actions')
const results = $('results')

const session = new WordSession()
let busy = false

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function setStatus(text: string, error = false) {
  status.textContent = text
  status.classList.toggle('is-error', error)
}

async function run(task: () => Promise<unknown>) {
  if (busy) return
  busy = true
  setStatus('Working…')
  try {
    await task()
    setStatus('')
  } catch (err) {
    setStatus(`That didn't work: ${String((err as Error)?.message ?? err)}`, true)
  }
  busy = false
  render()
}

function render() {
  const flags = session.flags
  summary.textContent =
    flags.length === 0
      ? `No print waste found. About ${plural(session.pages, 'page')} (an estimate).`
      : `About ${plural(session.pages, 'page')} (an estimate), ${plural(flags.length, 'issue')} found.`

  actions.replaceChildren()
  const apply = session.applicableCount
  if (apply > 0) {
    const all = el('button', 'btn btn-primary', `Apply ${plural(apply, 'fix', 'fixes')}`)
    all.type = 'button'
    all.addEventListener('click', () => void run(() => session.applyAll()))
    actions.append(all)
  }
  const again = el('button', 'btn btn-quiet', 'Scan again')
  again.type = 'button'
  again.addEventListener('click', () => void run(() => session.scan()))
  actions.append(again)

  results.replaceChildren()
  if (session.blocked) results.append(el('p', 'fx-unsupported', `Editing is off. ${session.blocked}`))
  results.append(
    renderFlagCards(flags, {
      onApply: (f) => void run(() => session.apply(f)),
      onShow: (f) => void run(() => session.show(f)),
      unsupported: (f) => session.unsupported(f),
    }),
  )
}

Office.onReady(async (info) => {
  if (info.host !== Office.HostType.Word) {
    summary.textContent = 'GreenPages for Word only runs inside Microsoft Word.'
    return
  }
  await run(() => session.scan())
})
