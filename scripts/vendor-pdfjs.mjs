// Copies pdf.js from node_modules into the website, so the PDF check page loads it from
// our own origin instead of a CDN. Run by the Pages workflow and by `npm run site:vendor`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = resolve(root, 'node_modules/pdfjs-dist/build')
const to = resolve(root, 'site/pdf-check/vendor')

mkdirSync(to, { recursive: true })
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  copyFileSync(resolve(from, file), resolve(to, file))
  console.log(`copied ${file} -> site/pdf-check/vendor/`)
}
// Apache-2.0 requires the licence to travel with the redistributed files.
const licence = resolve(root, 'node_modules/pdfjs-dist/LICENSE')
if (existsSync(licence)) copyFileSync(licence, resolve(to, 'LICENSE-pdfjs.txt'))
