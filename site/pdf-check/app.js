// PDF check (experimental spike). Renders each page of a PDF with pdf.js, measures how
// much of it is inked, and reports blank pages, ink-heavy pages and colour pages, plus the
// sheet count for common print settings. Everything happens in this tab: the file is read
// in memory and never sent anywhere.
//
// pdf.js is copied into ./vendor/ at deploy time (scripts/vendor-pdfjs.mjs), not loaded
// from a CDN.

import * as pdfjs from './vendor/pdf.min.mjs'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href

// Thresholds, as a share of the page's pixels. Rough by design: this is a spike.
const BLANK_MAX = 0.002 // under 0.2% inked: effectively blank
const HEAVY_MIN = 0.18 // over 18% ink coverage: ink-heavy
const COLOUR_MIN = 0.01 // over 1% clearly coloured pixels: a colour page
const RENDER_WIDTH = 220 // px; small renders are plenty for coverage and fast

const $ = (id) => document.getElementById(id)
const drop = $('drop')
const fileInput = $('file')
const status = $('status')

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) void check(fileInput.files[0])
})
for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => {
    e.preventDefault()
    drop.classList.add('is-over')
  })
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, () => drop.classList.remove('is-over'))
}
drop.addEventListener('drop', (e) => {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (file) void check(file)
})

function say(text, isError = false) {
  status.textContent = text
  status.classList.toggle('is-error', isError)
}

async function check(file) {
  $('results').hidden = true
  if (file.type && file.type !== 'application/pdf') {
    say('That file is not a PDF. Save the document as a PDF and try again.', true)
    return
  }
  say(`Reading ${file.name}…`)
  let pdf
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  } catch (err) {
    say(`Couldn't open this PDF. ${err?.message ?? ''}`.trim(), true)
    return
  }

  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    say(`Checking page ${n} of ${pdf.numPages}…`)
    pages.push(await measure(await pdf.getPage(n), n))
  }
  render(file.name, pages)
  say(`Checked ${pages.length} page${pages.length === 1 ? '' : 's'}.`)
}

async function measure(page, n) {
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const total = data.length / 4
  let ink = 0
  let inked = 0
  let coloured = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const darkness = 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b)
    if (darkness > 0.04) {
      inked++
      ink += darkness
      if (Math.max(r, g, b) - Math.min(r, g, b) > 0.2) coloured++
    }
  }
  return {
    n,
    thumb: canvas.toDataURL('image/png'),
    inkedShare: inked / total,
    coverage: ink / total,
    colourShare: coloured / total,
  }
}

function classify(p) {
  if (p.inkedShare < BLANK_MAX) return 'blank'
  if (p.coverage > HEAVY_MIN) return 'heavy'
  return p.colourShare > COLOUR_MIN ? 'colour' : 'ok'
}

const LABEL = { blank: 'Blank', heavy: 'Ink-heavy', colour: 'Colour', ok: '' }

function render(name, pages) {
  const kinds = pages.map(classify)
  const blank = pages.filter((_, i) => kinds[i] === 'blank')
  const heavy = pages.filter((_, i) => kinds[i] === 'heavy')
  const colourCount = pages.filter((p) => p.colourShare > COLOUR_MIN).length
  const printable = pages.length - blank.length

  const sheets = [
    ['One-sided', pages.length],
    ['Double-sided', Math.ceil(pages.length / 2)],
    ['Double-sided, blank pages skipped', Math.ceil(printable / 2)],
    ['2 pages per side, double-sided', Math.ceil(printable / 4)],
  ]

  const one = (arr) => arr.length === 1
  const tips = []
  if (blank.length)
    tips.push(
      `Skip the blank page${one(blank) ? '' : 's'} (${list(blank)}) by printing a page range.`,
    )
  if (heavy.length)
    tips.push(
      `Page${one(heavy) ? '' : 's'} ${list(heavy)} use${one(heavy) ? 's' : ''} a lot of ink. Print ${one(heavy) ? 'it' : 'them'} in draft quality, or leave ${one(heavy) ? 'it' : 'them'} out if not needed on paper.`,
    )
  if (colourCount)
    tips.push(
      `${colourCount} page${colourCount === 1 ? ' has' : 's have'} colour. Printing in black and white saves colour ink.`,
    )
  tips.push('Double-sided printing halves the paper. Two pages per side halves it again for notes and drafts.')

  $('summary').innerHTML = `
    <div class="pc-card">
      <h2>${escapeHtml(name)}</h2>
      <table class="pc-sheets">
        <thead><tr><th scope="col">Print setting</th><th scope="col">Sheets</th></tr></thead>
        <tbody>${sheets.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="pc-card">
      <h2>Ways to save</h2>
      <ul>${tips.map((t) => `<li>${t}</li>`).join('')}</ul>
    </div>`

  $('grid').innerHTML = pages
    .map((p, i) => {
      const kind = kinds[i]
      const label = LABEL[kind]
      return `<li>
        <img src="${p.thumb}" alt="Page ${p.n}${label ? `, ${label.toLowerCase()}` : ''}" loading="lazy" />
        <div class="pc-meta"><span>Page ${p.n}</span>${label ? `<span class="pc-badge ${kind}">${label}</span>` : ''}</div>
      </li>`
    })
    .join('')
  $('results').hidden = false
}

function list(pages) {
  return pages.map((p) => p.n).join(', ')
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}
