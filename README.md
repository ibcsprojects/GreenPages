# GreenPages

A Chrome extension that finds print waste in Google Docs and fixes it. It sits in the corner
of the editor, the way a spell checker does, lists what will cost you paper or ink, and
applies the fixes you accept. It runs entirely in your browser: no server, no AI, no account
with us.

**Website:** <https://ibcsprojects.github.io/GreenPages/> (homepage, privacy policy, and a
PDF check that works with files from any app).

## What it catches

| Issue | Fix |
|-------|-----|
| Highlighted text | Underline instead of an ink-heavy fill |
| Oversized body text | Back to body size |
| Wide margins | Default margins, where that saves paper |
| Stacked blank lines, trailing blank pages | Collapsed |
| Hard page breaks | A thin divider |
| Long lists of short bullets | A compact table |
| Oversized images | Scaled down |
| Wordy paragraphs | Plain-language rewrite, with every change listed |
| Wide paragraph indents | Pulled back to the margin |

Press Ctrl+P or Cmd+P in a document and GreenPages shows the page count and anything
unfixed before the print dialog opens.

## Install

GreenPages isn't in the Chrome Web Store yet. To try it now:

```bash
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `dist/` folder.
3. Open any Google Doc. The GreenPages button appears in the bottom-right corner of the
   editor. Click it, then **Connect to Google Docs** (Google asks once).
4. Click the toolbar icon anywhere else to open a demo document with no sign-in.

While the Google app is unverified, only accounts added as test users in the Google Cloud
project can connect. See [docs/SETUP.md](docs/SETUP.md).

## Privacy

GreenPages uses one Google permission, `documents`, to read the document you have open
and apply the fixes you accept. Nothing is sent to us or to any AI service. Full policy:
[site/privacy.html](site/privacy.html).

## Develop

| Command | Does |
|---------|------|
| `npm run build` | Typecheck and build the extension into `dist/` |
| `npm test` | Unit tests (rules engine, rewriter, page estimate, edit backends) |
| `npm run typecheck` | TypeScript only |
| `npm run site:vendor` | Copy pdf.js into `site/` so the PDF check works locally |

CI runs the typecheck, tests and build on every pull request. How the pieces fit:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Launch status and remaining manual steps:
[docs/LAUNCH.md](docs/LAUNCH.md).

## Licence

[MIT](LICENSE)
