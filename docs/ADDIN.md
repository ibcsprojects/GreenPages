# Word add-in

A task pane inside Microsoft Word (Windows, Mac and the web). It reads the open document,
lists print-waste issues, jumps to each one, and fixes what Word's own editing API can do
exactly. The same checks as the Chrome extension, through the shared Word-format core in
`src/lib/ooxml/`.

## What it does and does not fix

| Fix | In the add-in |
|-----|---------------|
| Highlights to underline, oversized text, wide indents, blank lines, oversized pictures, wordy paragraphs | Yes, when the issue covers whole paragraphs (blank-line removal and picture scaling always) |
| A highlight or font size that covers only part of a paragraph | No. The card says to use the Word file tool. |
| Page break to a dividing line, bullets to a table, margins | No. Word's add-in API cannot do these exactly. The card points to the Word file tool or the menu path in Word. |

This is deliberate. Edits only go through Word's own API, one paragraph at a time, so Word's
undo works and nothing the add-in does not understand is touched. Before any edit it checks
that Word's paragraph list matches what it read; if anything differs (for example content
controls), editing switches off for that document and it says why.

## How it works

- `src/addin/wordRun.ts` is the only file that calls Word. It reads `body.getOoxml()` and the
  paragraph list, selects paragraphs, and carries out steps.
- `src/addin/plan.ts` turns a fix into exact steps and lines Word's paragraphs up with the model.
  It is pure and unit tested (`plan.test.ts`).
- `src/addin/main.ts` is the task pane UI; the page is `site/addin/taskpane.html`.
- `addin/manifest.template.xml` is the manifest. `npm run site:build` writes
  `site/addin/manifest.xml` for the address in `SITE_URL`.
- Office.js is loaded from Microsoft's servers, as Microsoft requires.

## Try it on your own Word

1. One time: `npx office-addin-dev-certs install` (makes and trusts a local HTTPS certificate).
2. `npm run addin:dev` builds the add-in for `https://localhost:3000` and serves it.
3. Load `site/addin/manifest.xml` into Word:
   - **Word on the web:** Insert, then Add-ins, then Upload My Add-in, and choose the file.
   - **Word on Mac:** copy the file to
     `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/`, restart Word, then Insert,
     My Add-ins, Developer Add-ins.
   - **Word on Windows:** share a folder holding the file and add it as a trusted catalog
     (File, Options, Trust Center, Trusted Add-in Catalogs).
4. Open a document, then Home, then Print check.

Microsoft's current sideloading steps are at
https://learn.microsoft.com/office/dev/add-ins/testing/test-debug-office-add-ins.

## Notes

Built and unit tested, and exercised in a browser against a stand-in for Word's API. Try it
on copies of real documents and check that Undo reverses each fix.
