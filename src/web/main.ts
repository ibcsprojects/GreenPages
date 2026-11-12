// The "Fix a Word file" page: choose a .docx, review the issues, apply fixes, download a copy.
// All text from the document is written with textContent, never as HTML.

import { DocxError, DocxSession } from './docxFix'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const drop = $('drop')
const input = $<HTMLInputElement>('file')
const status = $('status')
const results = $('results')

let session: DocxSession | null = null

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function setStatus(text: string, error = false) {
  status.textContent = text
  status.classList.toggle('is-error', error)
}

async function handleFile(file: File | undefined) {
  if (!file) return
  results.replaceChildren()
  if (!/\.docx$/i.test(file.name)) {
    setStatus(
      /\.doc$/i.test(file.name)
        ? 'That is an older .doc file. In Word, choose File, then Save As, and pick the .docx format.'
        : 'Please choose a Word .docx file.',
      true,
    )
    return
  }
  setStatus('Reading the file…')
  try {
    session = DocxSession.open(new Uint8Array(await file.arrayBuffer()), file.name)
    setStatus('')
    render()
  } catch (err) {
    session = null
    setStatus(err instanceof DocxError ? err.message : 'Something went wrong reading that file.', true)
  }
}

function render() {
  if (!session) return
  const s = session
  const flags = s.flags
  results.replaceChildren()

  const summary = el('section', 'pc-card fx-summary')
  summary.append(el('h2', undefined, s.name))
  const pagesNow = s.pages
  summary.append(
    el(
      'p',
      'fx-pages',
      s.appliedCount === 0
        ? `About ${plural(pagesNow, 'page')} (an estimate), ${plural(flags.length, 'issue')} found.`
        : `About ${plural(s.pagesBefore, 'page')} before, about ${plural(pagesNow, 'page')} now (estimates). ${plural(flags.length, 'issue')} left.`,
    ),
  )
  const bar = el('div', 'fx-actions')
  if (flags.length > 0) {
    const all = el('button', 'btn btn-primary', `Apply all ${plural(flags.length, 'fix', 'fixes')}`)
    all.type = 'button'
    all.addEventListener('click', () => run(() => s.applyAll()))
    bar.append(all)
  }
  const save = el('button', 'btn btn-quiet', 'Download fixed copy')
  save.type = 'button'
  save.disabled = s.appliedCount === 0
  save.addEventListener('click', () => download(s))
  bar.append(save)
  summary.append(bar)
  summary.append(
    el(
      'p',
      'fx-note',
      s.appliedCount === 0
        ? 'Your original file is never changed. Fixes go into a new copy that you download.'
        : 'Open the copy in Word and check it before printing. Your original is untouched.',
    ),
  )
  results.append(summary)

  if (flags.length === 0) {
    results.append(el('p', 'fx-clean', s.appliedCount ? 'No issues left. Download your fixed copy above.' : 'No print waste found. Nice work.'))
    return
  }

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
    const foot = el('div', 'fx-foot')
    if (f.impact.paper >= 0.05) foot.append(el('span', 'fx-saves', `Saves about ${f.impact.paper.toFixed(1)} of a page`))
    const apply = el('button', 'btn btn-quiet', 'Apply')
    apply.type = 'button'
    apply.addEventListener('click', () => run(() => s.apply(f.id)))
    foot.append(apply)
    li.append(foot)
    list.append(li)
  }
  results.append(list)
}

async function run(task: () => Promise<void>) {
  try {
    await task()
  } catch {
    setStatus('That fix could not be applied to this file.', true)
  }
  render()
}

function download(s: DocxSession) {
  const bytes = s.export()
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const a = el('a')
  a.href = url
  a.download = s.name.replace(/\.docx$/i, '') + ' (fixed).docx'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

input.addEventListener('change', () => void handleFile(input.files?.[0]))
for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => {
    e.preventDefault()
    drop.classList.add('is-over')
  })
}
for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('is-over'))
drop.addEventListener('drop', (e) => {
  e.preventDefault()
  void handleFile((e as DragEvent).dataTransfer?.files?.[0])
})
