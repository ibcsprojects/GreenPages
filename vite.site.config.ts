// Bundles the page scripts for the website (npm run site:build): the "Fix a Word file" page,
// and, with `--mode addin`, the Word task pane.
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const addin = mode === 'addin'
  return {
    publicDir: false,
    build: {
      outDir: addin ? 'site/addin' : 'site/docx-fix',
      emptyOutDir: false, // the page's HTML and CSS live in the same folder
      target: 'es2020',
      lib: {
        entry: resolve(__dirname, addin ? 'src/addin/main.ts' : 'src/web/main.ts'),
        formats: ['iife'] as ['iife'],
        name: addin ? 'SparePageAddin' : 'SparePageDocxFix',
        fileName: () => (addin ? 'addin.js' : 'docx-fix.js'),
      },
    },
  }
})
