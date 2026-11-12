// Bundles the page scripts for the website (npm run site:build): the "Fix a Word file" page,
// with `--mode addin` the Word task pane, and with `--mode home` the homepage tool.
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const addin = mode === 'addin'
  const home = mode === 'home'
  return {
    publicDir: false,
    build: {
      outDir: addin ? 'site/addin' : home ? 'site' : 'site/docx-fix',
      emptyOutDir: false, // the page's HTML and CSS live in the same folder
      target: 'es2020',
      lib: {
        entry: resolve(__dirname, addin ? 'src/addin/main.ts' : home ? 'src/web/home.ts' : 'src/web/main.ts'),
        formats: ['iife'] as ['iife'],
        name: addin ? 'SparePageAddin' : home ? 'SparePageHome' : 'SparePageDocxFix',
        fileName: () => (addin ? 'addin.js' : home ? 'home.js' : 'docx-fix.js'),
      },
    },
  }
})
