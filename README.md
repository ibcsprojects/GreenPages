# Sparepage

A Chrome extension that finds print waste in Google Docs and fixes it. It sits in the corner
of the editor, the way a spell checker does, lists what will cost you paper or ink, and
applies the fixes you accept. It runs entirely in your browser: no server, no AI, no account
with us.

**Website:** <https://sparepage.app> (homepage, privacy policy, and a
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

Press Ctrl+P or Cmd+P in a document and Sparepage shows the page count and anything
unfixed before the print dialog opens.

## Also on the website

- **Word file tool** (`site/docx-fix/`): choose a .docx, review the issues, download a fixed copy. It uses the same checks as the extension on Word's document XML (`src/lib/ooxml/`) and runs entirely in the browser. Build it with `npm run site:build`.
- **Word add-in** (`site/addin/`, notes in `docs/ADDIN.md`): a task pane inside Word with the same checks. Try it with `npm run addin:dev`.
- **PDF check** (`site/pdf-check/`): finds blank and ink-heavy pages in any PDF.

## Install

Sparepage isn't in the Chrome Web Store yet. To try it now:

```bash
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `dist/` folder.
3. Open any Google Doc. The Sparepage button appears in the bottom-right corner of the
   editor. Click it, then **Connect to Google Docs** (Google asks once).
4. Click the toolbar icon anywhere else to open a demo document with no sign-in.

While the Google app is unverified, only accounts added as test users in the Google Cloud
project can connect. See [docs/SETUP.md](docs/SETUP.md).

## Privacy

Sparepage uses one Google permission, `documents`, to read the document you have open
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
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licence

[MIT](LICENSE)

## Security and support

Report security problems privately to security@sparepage.app (see [SECURITY.md](SECURITY.md)). For
anything else, email support@sparepage.app or open an issue.

## Credits

Created by Manav Purswani and Cata Gamero.

## Disclaimer

Sparepage is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Google. Google, Google Docs and Chrome are trademarks of Google LLC. The software is provided "as is" under the MIT licence, without warranty. It edits your document only when you click Apply, and Google Docs keeps version history so you can restore an earlier copy.
