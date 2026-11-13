# Architecture

```
                 ┌──────────────────────────────────────────────────┐
                 │          Service worker (state owner)            │
                 │  one session per document: DocModel · Flag[] ·   │
                 │  dismissed · page count · settings               │
                 │  analyzeDoc() → EditBackend.apply() → pages      │
                 └──────▲───────────────────────────────▲───────────┘
                        │ chrome.runtime messages        │ Docs API (OAuth, `documents`)
                        │                                │ Docs PDF export (page count)
        ┌───────────────┴──────────────┐        ┌────────┴─────────┐
        │ Content script (Google Docs) │        │  Google          │
        │  • overlay (Shadow DOM)      │        └──────────────────┘
        │  • print intercept           │
        │  • reveal via Docs' Find     │   Demo page (extension page): the same
        └──────────────────────────────┘   overlay over the bundled sample doc
```

There is no backend. Everything runs in the user's browser, and the only network calls go
to Google: the Docs API (read the open document, apply accepted edits) and Docs' own PDF
export (exact page count).

## Components

- **`src/background/service-worker.ts`** owns state. It keeps a session per document,
  keyed by the Google Doc id in the sender's tab URL (or `sample` for the demo page), so
  several open documents never mix. It handles `GET_STATE`, `REANALYZE`, `APPLY_FLAG`,
  `APPLY_ALL`, `DISMISS_FLAG`, `REVEAL_FLAG`, `UPDATE_SETTINGS` and `GET_PRINT_SUMMARY`.
  Google's sign-in window is only allowed on `GET_STATE { connect: true }`, which is sent
  when the user clicks **Connect**; a page load checks access silently.

- **`src/overlay/`** is the UI: React, Tailwind, zustand and Framer Motion, mounted into a
  Shadow DOM by `mount.tsx` so Docs' CSS can't reach it. `Overlay.tsx` holds the launcher
  (pinned to the bottom-right corner of `.kix-appview-editor`) and the panel; `components/`
  holds the score strip, issue cards and sort menu; `store.ts` mirrors worker state. The
  Tailwind CSS is imported as a string (`overlay.css?inline`) and injected into the shadow
  root.

- **`src/content/`** runs on `docs.google.com/document/*`. `content.ts` mounts the overlay
  and implements "Show" by driving Docs' native Find bar (hidden), the only way to scroll
  to and highlight text that Docs paints on a canvas. `printIntercept.ts` catches Ctrl/Cmd+P
  and shows `PrintModal.ts`.

- **`src/demo/`** is an extension page with a rendered sample document and the same
  overlay. The toolbar icon opens it on any page that isn't a Google Doc.

- **`src/lib/`** is the framework-free core, unit-tested:
  - `docModel.ts`: paragraphs of styled runs (mirrors the Docs API), plus `SAMPLE_DOC`.
  - `analyzer/rules.ts`: the detectors that produce `Flag[]`.
  - `analyzer/condense.ts`: the offline rewriter. A library of plain-language rules (padded
    phrases, doublets, filler openers and filler words), repeated-sentence removal, and for very
    long paragraphs an extractive trim that leaves out the least important sentences. It reports
    each change. A trim is marked `reviewFirst` and is never part of Apply all.
  - `revealQuery.ts`: picks the short plain-text snippet that "Show" searches for in Docs' Find
    bar, from the flagged span or, for blank lines, images and page breaks, from the text beside it.
  - `progress.ts`: the progress ring's score (issues fixed out of the most seen).
  - `docBackend.ts`: `EditBackend`, with `MockDocsBackend` (demo) and `GoogleDocsBackend`
    (Docs API `batchUpdate`).
  - `googleDocs.ts`: OAuth, reading a doc into `DocModel`, writing edits, and the exact
    page count from Docs' PDF export.
  - `pageEstimate.ts`: a layout estimate in points (page size, margins, indents, line
    spacing, heading spacing, images, table rows), used when the exact count isn't
    available and labelled "estimate" in the UI.
  - `messaging.ts`: the typed message protocol.

- **`site/`** is the GitHub Pages website: homepage, privacy policy and the experimental
  PDF check (pdf.js, all in the browser).

## Data flow for "Apply"

1. The user clicks **Apply** on a card: `store.apply(flagId, overrideText?)`.
2. `APPLY_FLAG` reaches the worker, which finds the sender's session and flag, then calls
   `EditBackend.apply(doc, action)`.
3. `GoogleDocsBackend` sends `batchUpdate` and re-reads the document;
   `MockDocsBackend` edits the sample in memory.
4. The worker re-analyzes, refreshes the page count and replies with `STATE`.

## Page count

The Docs API has no page count. The worker first tries Docs' own PDF export
(`/document/d/<id>/export?format=pdf`, fetched with the user's existing Google session)
and counts pages in the PDF. This needs no Drive scope. It is undocumented, so on any
failure the worker falls back to `pageEstimate.ts`, and the UI says "estimate".

## The canvas constraint

Google Docs paints text on a `<canvas>`, so an extension can't place underlines under
specific words reliably. The overlay therefore lists issues in a panel instead of drawing
on the text, and **Show** uses Docs' Find to jump to each one. The Docs API gives
character ranges, which is all analysis and editing need.
