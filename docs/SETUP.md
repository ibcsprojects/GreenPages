# Going live — connecting the Google Docs API

GreenPages runs fully offline by default (bundled demo doc + local rules, including the
wordy-phrase shortener). The one real integration is the Google Docs API, which replaces the
demo doc with the user's live document and makes **Apply** write back.

---

## Google Docs API (read & write the live document)

### 3a. Google Cloud project

1. <https://console.cloud.google.com> → new project.
2. **APIs & Services → Enable APIs** → enable **Google Docs API**.
3. **OAuth consent screen** → External → add scope
   `https://www.googleapis.com/auth/documents`.
4. **Credentials → Create OAuth client ID → Chrome extension**. Use your unpacked
   extension ID (`chrome://extensions` shows it). Copy the client ID.

### 3b. Extension changes — ✅ already implemented

All the code below is wired; the only manual edit is your client ID.

1. `manifest.config.ts` declares the `oauth2` block and the `identity` permission.
   **Paste your client ID** into `oauth2.client_id`.
2. OAuth, reading, and writing live in `src/lib/googleDocs.ts`
   (`getActiveGoogleDocId`, `fetchGoogleDoc`, `pushBatchUpdate`). Tokens come from
   `chrome.identity.getAuthToken` and auto-refresh once on a 401.
3. **Read** — `service-worker.ts` → `ensureDoc()` detects the active Google Doc tab,
   calls `documents.get`, and maps the response to `DocModel`
   (`paragraphs → elements[].textRun` with `fontSize`, `backgroundColor`, `bullet`,
   `pageBreak`). If you're not on a Doc (or decline auth) it stays on `SAMPLE_DOC`.
4. **Write** — `service-worker.ts` swaps in `GoogleDocsBackend` automatically once a live
   doc loads; `docBackend.ts` issues the real `batchUpdate` and re-reads the doc after each
   edit so indices stay in sync.

### 3c. Index translation — ✅ done

Docs API edits use **document indices**, not our flat-text offsets. The read mapping stores
each run's Docs `startIndex` (`TextRun.docStart`) and each paragraph's
`[docStart, docEnd)`. `docBackend.ts → toDocIndex()` translates flat offsets to Docs indices
in `buildRequests`. Re-reading after every edit avoids index-shift bookkeeping.

> **Tables:** `bulletsToTable` inserts a real Google Docs table. Because a table's cell
> indices don't exist until the table is created, `GoogleDocsBackend.applyBulletsToTable`
> does it in two passes — insert the empty grid, re-read the doc, then fill each cell
> (highest index first). Column count is chosen adaptively in `tableLayout` to stay compact
> without breaking long words. Offline, the mock stands in with one paragraph per grid row.

---

## Verifying

- Offline: `npm run build`, load `dist/`, open a Doc — 6 demo flags, Apply works, Ctrl+P
  shows the modal.
- With Docs API: open your own wasteful doc — flags now reflect *your* content and Apply
  edits the live document.
