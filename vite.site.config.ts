// Bundles the "Fix a Word file" page script for the website (npm run site:build).
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'site/docx-fix',
    emptyOutDir: false, // the page's HTML and CSS live in the same folder
    target: 'es2020',
    lib: {
      entry: resolve(__dirname, 'src/web/main.ts'),
      formats: ['iife'],
      name: 'GreenPagesDocxFix',
      fileName: () => 'docx-fix.js',
    },
  },
})
