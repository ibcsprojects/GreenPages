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
| Word file tool (`site/docx-fix/`) | Built and tested in a browser with a sample file. **Needs a test with real Word files**: open the downloaded copy in Word and check it opens without a repair prompt. |
| Word add-in | Not built yet. It will reuse `src/lib/ooxml/`. Needs a Microsoft Partner Center account to publish. |

### Live tests still needed

- **Exact page count.** Open a doc, connect, and check the panel says "N pages" without
  "estimate". If it always shows "estimate", the export fetch is being blocked (open the
  service worker console from `chrome://extensions` to see the reason). The fallback keeps
  everything working either way.
- **Overlay placement in real Docs.** The launcher anchors to `.kix-appview-editor`. Check
  it sits inside the editor and clear of Docs' right-hand toolbar.
- **Estimate accuracy.** Compare "About N pages" with File > Print on a few real documents.

## Legal and policy checklist

Not legal advice. A lawyer, a school or a parent should confirm the items marked **Decide**.

| Item | Status |
|------|--------|
| **Decide: the name.** GreenPages, Inc. (Kittery, Maine; also trading as GreenPages Technology Solutions and Blue Mantis) holds a registered GREENPAGES trademark and many related marks covering IT, cloud and software services. A software product with the same name risks a takedown request or a demand letter, and the Chrome Web Store removes listings on trademark complaints. Rename before launch, or search the USPTO (tmsearch.uspto.gov) and get advice. | **Open** |
| **Decide: who owns the accounts.** Chrome Web Store, Google Cloud and GitHub need an adult who can accept their terms. If any contributor is under 18, a parent, guardian or teacher should own them. Also check the school or competition rules on who owns the work and whether it may be published. | **Open** |
| **Decide: the icon.** Confirm everyone who drew or sourced `public/icons/*` agrees it can be released under the MIT licence, and that it is not taken from somewhere else. | **Open** |
| Non-affiliation notice and Google trademark attribution | Done: site footers, README, store description. |
| Privacy policy: what is accessed, where it goes, Limited Use statement, who runs it, children, contact | Done. Add a support email if Google's form asks for one. |
| Scope is `documents` only (sensitive, not restricted, so no paid security assessment) | Done. |
| Homepage and privacy policy on a domain you can verify in Search Console. `github.io` is a shared domain and may be rejected, so a bought domain is safest. | **Open** |
| Host permission `*.googleusercontent.com` justified in the store form | Done in this file. Expect a closer review because of it. |
| Open-source licence notices | Done: `public/THIRD_PARTY_NOTICES.txt` ships in the extension (`npm run notices` regenerates it); the pdf.js licence is copied beside the vendored files. |
| No secrets in the repo or history | Checked: no API keys or private keys found in any commit. The Gemini key itself still needs deleting in Google AI Studio. |
| No personal data in the repo | Checked: no emails or document IDs in tracked files. |
| Environmental claims | The site makes none beyond page counts and plain arithmetic. Do not add claims such as "saves trees" without evidence. |
| Page count uses Docs' own PDF export, an undocumented Google URL | Low risk, and it falls back to an estimate if Google blocks it. Mention it in the store notes. |

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
> GreenPages is an independent project, not affiliated with or endorsed by Google.
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
