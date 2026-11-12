// Serves site/ over HTTPS on https://localhost:3000 so Word can load the add-in while you test.
// One-time setup: npx office-addin-dev-certs install   (creates and trusts a local certificate)
import { createServer } from 'node:https'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'

const certDir = join(homedir(), '.office-addin-dev-certs')
const key = join(certDir, 'localhost.key')
const cert = join(certDir, 'localhost.crt')
if (!existsSync(key) || !existsSync(cert)) {
  console.error('No local certificate yet. Run: npx office-addin-dev-certs install')
  process.exit(1)
}
const root = resolve('site')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.xml': 'application/xml' }

createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
  let path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  let file = join(root, path)
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404).end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
}).listen(3000, () => console.log('Add-in test server: https://localhost:3000/addin/taskpane.html'))
