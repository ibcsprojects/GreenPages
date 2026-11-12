# Launch checklist

Status of each next action from the launch plan, plus the text to paste into the Chrome Web
Store and Google's OAuth verification forms.

## Next actions

| Action | Status |
|--------|--------|
| Remove `drive.readonly` and the Drive export | Done. The only scope is `documents`. |
| Test the export-URL page count, fall back to an improved estimate | Built. Exact count comes from Docs' own PDF export with the user's session; any failure falls back to a layout estimate labelled "estimate". **Needs a live test** (see below). |
| Delete `api/`, `server/` and the Vercel project | Code deleted. **Manual:** delete the `usaii-2026` Vercel project and its `VITE_BACKEND_URL` variable. |
| Rotate or delete the Gemini key | **Manual:** delete the key in Google AI Studio. Nothing in the code uses it now. |
| AI settings screen (on-device AI, bring your own key) | Not built. Per the plan's note, rewrites now use offline plain-language rules instead of AI, so no AI path is needed. Paragraph rewrites were the only AI use in the project. |
| Test Chrome's on-device model | Not needed (no AI). |
| Prototype ChatGPT and OpenRouter sign-in | Not needed (no AI). |
| Licence, README, CI | Done. MIT licence; CI runs typecheck, tests and build on every PR. |
| Privacy policy and homepage on GitHub Pages | Built in `site/`. **Manual:** repo Settings > Pages > Source: GitHub Actions. |
| Record the demo video and submit OAuth verification | **Manual.** Script and answers below. |
| Web Store listing | Text and permission justifications below. **Manual:** pay the fee, upload, screenshots. |
| Remove the manifest key; new OAuth client for the store ID | There is no `key` in the manifest, so nothing to remove. The client ID is now set per build with `GREENPAGES_OAUTH_CLIENT_ID`. |
| Overlay inside the editor instead of a side panel | Done. The side panel is gone. |
| Spike a PDF page that finds blank and ink-heavy pages | Built at `site/pdf-check/`, marked Experimental. |
| Pick product ideas for v1.1 | Team decision. |

### Live tests still needed

- **Exact page count.** Open a doc, connect, and check the panel says "N pages" without
  "estimate". If it always shows "estimate", the export fetch is being blocked (open the
  service worker console from `chrome://extensions` to see the reason). The fallback keeps
  everything working either way.
- **Overlay placement in real Docs.** The launcher anchors to `.kix-appview-editor`. Check
  it sits inside the editor and clear of Docs' right-hand toolbar.
- **Estimate accuracy.** Compare "About N pages" with File > Print on a few real documents.

## Order to do the manual steps

1. Enable GitHub Pages (Actions source). The site deploys on the next push to `main`.
2. Decide the homepage domain. Google needs the homepage and privacy policy on a domain
   you can verify in Search Console. If `ibcsprojects.github.io` is not accepted, buy a
   domain (about $10 a year) and point Pages at it.
3. Create the Chrome Web Store developer account ($5 once), upload a draft build, and copy
   the extension ID it assigns.
4. Create a "Chrome extension" OAuth client for that ID, then build the store package:
   `GREENPAGES_OAUTH_CLIENT_ID=<store client id> npm run build` and zip `dist/`.
5. Fill the OAuth consent screen (below), record the demo video, submit for verification.
6. Submit the store listing. Until Google verifies the app, publish as Unlisted or Private
   and add testers as OAuth test users.

## Chrome Web Store listing

**Name:** GreenPages: Eco Formatting for Docs

**Summary (132 characters max):**
Spots print waste in Google Docs (highlights, big fonts, blank pages, wordy text) and fixes it in one click. Runs in your browser.

**Description:**

> GreenPages checks your Google Doc for formatting that wastes paper and ink, then fixes it
> with one click. It sits in the corner of the editor, like a spell checker.
>
> It finds highlighted text, oversized body text, wide margins, stacked blank lines and
> trailing blank pages, hard page breaks, long lists of short bullets, oversized images and
> wordy paragraphs. Each issue shows the fix and how much paper it saves. Apply fixes one at
> a time or all at once.
>
> Before you print, Ctrl+P or Cmd+P shows the page count and anything you haven't fixed.
>
> Private by design: GreenPages has no server and uses no AI services. It reads the
> document you have open through Google's Docs API, checks it in your browser, and writes
> back only the fixes you accept. Free and open source.

**Category:** Productivity. **Language:** English.

**Single purpose:** Find and fix formatting in Google Docs that wastes paper and ink when
printed.

**Permission justifications:**

| Permission | Justification |
|------------|---------------|
| `identity` | Signs the user in with Google so the extension can read the open document through the Google Docs API and apply the formatting fixes the user accepts. |
| `storage` | Saves the user's GreenPages settings on their device. |
| Host `https://docs.google.com/*` | Shows the GreenPages panel inside Google Docs, intercepts Ctrl/Cmd+P to show the print check, and reads Docs' own PDF export of the open document to count its printed pages. |
| Host `https://*.googleusercontent.com/*` | Google Docs redirects its own PDF export to a `doc-*-docstext.googleusercontent.com` address. The extension needs access to that host to download the export and count its pages. It is used for nothing else. |
| OAuth scope `documents` | Reads the content and formatting of the document the user is working in, and edits it when the user clicks Apply. |

**Remote code:** No. All code ships in the package.

**Data usage disclosures:** collects no user data. Tick "I do not sell or transfer user
data to third parties", "not used for purposes unrelated to the single purpose", "not used
to determine creditworthiness".

**Screenshots (1280×800):** load the extension, click the toolbar icon on any non-Docs page
to open the demo, and capture: the panel with issues listed, an expanded wordy-paragraph
card, and the "Ready to print" state after Apply all. A fourth from a real Google Doc is
ideal.

## OAuth verification (sensitive scope)

**App name:** GreenPages. **Support email:** a team address you control. **Homepage:**
`https://ibcsprojects.github.io/GreenPages/`. **Privacy policy:**
`https://ibcsprojects.github.io/GreenPages/privacy.html`. **Authorized domain:** the
homepage domain, verified in Search Console.

**Scope:** `https://www.googleapis.com/auth/documents`

**Justification:**

> GreenPages is a Chrome extension that finds formatting in a Google Doc that wastes paper
> and ink when printed, and fixes it. It needs the documents scope to read the content and
> formatting of the document the user has open (text runs, font sizes, highlights,
> paragraph spacing, page margins, images, tables) and to apply the fixes the user
> explicitly accepts, such as removing a highlight, reducing a font size, or resetting
> margins, through documents.batchUpdate. A narrower scope is not possible: drive.file
> would require users to re-open each document through a picker instead of using the
> extension inside Docs, and documents.readonly cannot apply fixes. All processing happens
> in the user's browser; no document data is sent to our servers (we have none) or to
> third parties.

**Demo video script (2 to 3 minutes, unlisted on YouTube):**

1. Show the OAuth consent screen with the app name and the client ID visible in the URL.
2. Open a Google Doc with a highlight, large text, blank lines and wide margins.
3. Click the GreenPages button in the editor corner, then Connect to Google Docs; grant
   access.
4. Show the issue list. Click Show on one issue to jump to it.
5. Click Apply on two issues and show the document change in Docs.
6. Click Apply all, then press Ctrl/Cmd+P to show the print check.
7. Say: "GreenPages reads only the open document and edits it only when the user clicks
   Apply. Nothing is sent to our servers."
