// Writes site/addin/manifest.xml from addin/manifest.template.xml.
// SITE_URL is where the site is hosted (no trailing slash); the default is the GitHub Pages address.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const base = (process.env.SITE_URL ?? 'https://ibcsprojects.github.io/GreenPages').replace(/\/$/, '')
const xml = readFileSync(resolve(root, 'addin/manifest.template.xml'), 'utf8').replaceAll('{{BASE_URL}}', base)
mkdirSync(resolve(root, 'site/addin'), { recursive: true })
writeFileSync(resolve(root, 'site/addin/manifest.xml'), xml)
console.log(`wrote site/addin/manifest.xml for ${base}`)
