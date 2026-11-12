// Builds public/THIRD_PARTY_NOTICES.txt: the licence text of every library that ships inside
// the extension (the production dependency tree), as MIT and Apache-2.0 require. Run by
// `npm run notices`; the file is copied into dist/ by the build.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const pkg = readJson(resolve(root, 'package.json'))

const seen = new Map()
function visit(name, fromDir) {
  if (seen.has(name)) return
  // Resolve the way Node does: nearest node_modules walking up from the requiring package.
  let dir = fromDir
  let found = null
  while (dir.length >= root.length) {
    const candidate = resolve(dir, 'node_modules', name)
    if (existsSync(resolve(candidate, 'package.json'))) {
      found = candidate
      break
    }
    dir = dirname(dir)
  }
  if (!found) return // optional or platform-specific dependency that isn't installed
  const meta = readJson(resolve(found, 'package.json'))
  const licenceFile = readdirSync(found).find((f) => /^(licen[cs]e|copying)/i.test(f))
  seen.set(name, {
    version: meta.version,
    license: typeof meta.license === 'string' ? meta.license : JSON.stringify(meta.license),
    text: licenceFile ? readFileSync(resolve(found, licenceFile), 'utf8').trim() : '(no licence file in package)',
  })
  for (const dep of Object.keys(meta.dependencies ?? {})) visit(dep, found)
}
for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, root)

let out = 'Sparepage includes the following open-source libraries.\n'
for (const [name, info] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  out += `\n${'='.repeat(72)}\n${name} ${info.version} (${info.license})\n${'='.repeat(72)}\n\n${info.text}\n`
}
writeFileSync(resolve(root, 'public/THIRD_PARTY_NOTICES.txt'), out)
console.log(`wrote public/THIRD_PARTY_NOTICES.txt (${seen.size} packages)`)
