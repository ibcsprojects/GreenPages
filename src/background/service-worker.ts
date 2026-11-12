// The single source of truth. Keeps one session per document (keyed by the Google Doc id
// in the sender's tab, or "sample" for the bundled demo page) holding its DocModel, flags,
// dismissed ids and page count, and serves them to the in-editor overlay and the print
// check. Applying a fix runs through the EditBackend and re-analyzes so flags stay
// consistent. Nothing here talks to any server other than Google's own Docs endpoints.

import { SAMPLE_DOC, cloneDoc, flatten, type DocModel } from '../lib/docModel'
import type { Flag } from '../lib/analyzer/types'
import { analyzeDoc } from '../lib/analyzer/rules'
import { MockDocsBackend, GoogleDocsBackend, type EditBackend } from '../lib/docBackend'
import { applyAllFixes } from '../lib/applyAll'
import {
  docIdFromUrl,
  fetchGoogleDoc,
  fetchExportPageCount,
  hasDocsAccess,
  setInteractiveAuth,
} from '../lib/googleDocs'
import { estimatePages, lineLocation } from '../lib/pageEstimate'
import { DEFAULT_SETTINGS, onMessage, type Msg, type Settings } from '../lib/messaging'

interface Session {
  /** Google Doc id, or null for the offline sample. */
  docId: string | null
  doc: DocModel | null
  backend: EditBackend
  flags: Flag[]
  dismissed: Set<string>
  pages: number
  pagesExact: boolean
  /** Fingerprint of the doc the page count was taken from. */
  pagesSig: string
  loaded: boolean
  needsAccess: boolean
  notice: string | null
}

const sessions = new Map<string, Session>()
let settings: Settings = { ...DEFAULT_SETTINGS }
let settingsLoaded = false

async function loadSettings() {
  if (settingsLoaded) return
  const saved = await chrome.storage.local.get('settings')
  settings = { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) }
  settingsLoaded = true
}

/**
 * The session for whoever sent this message: their Google Doc, or the demo sample. Only
 * the extension's own demo page gets the sample; any other page that isn't an open
 * document (e.g. the Docs home page) gets nothing.
 */
function sessionFor(sender: chrome.runtime.MessageSender): Session {
  const docId = docIdFromUrl(sender.tab?.url)
  const isExtensionPage = (sender.url ?? '').startsWith(chrome.runtime.getURL(''))
  if (!docId && !isExtensionPage) throw new Error('Open a Google Doc to use SparePage.')
  const key = docId ?? 'sample'
  let s = sessions.get(key)
  if (!s) {
    s = {
      docId,
      doc: docId ? null : cloneDoc(SAMPLE_DOC),
      backend: docId ? new GoogleDocsBackend(docId) : new MockDocsBackend(),
      flags: [],
      dismissed: new Set(),
      pages: 1,
      pagesExact: false,
      pagesSig: '',
      loaded: false,
      needsAccess: false,
      notice: null,
    }
    sessions.set(key, s)
  }
  return s
}

/**
 * Load (or reload) a session's document. For a Google Doc this reads it through the Docs
 * API. Google's sign-in window is only allowed when the user explicitly clicked to connect
 * (`interactive`); on a plain page load we check silently and, without access, report
 * `needsAccess` so the overlay can offer a Connect button instead of popping a window.
 */
async function load(s: Session, interactive: boolean): Promise<void> {
  if (!s.docId) {
    s.loaded = true
    return
  }
  if (!interactive && !(await hasDocsAccess())) {
    s.needsAccess = true
    s.loaded = false
    return
  }
  setInteractiveAuth(interactive)
  try {
    s.doc = await fetchGoogleDoc(s.docId)
    s.loaded = true
    s.needsAccess = false
    s.notice = null
  } catch (err) {
    s.loaded = false
    s.notice = explainLoadError(String((err as Error)?.message ?? err))
    console.warn('[SparePage] Docs API load failed:', err)
  } finally {
    setInteractiveAuth(false)
  }
}

/** Turn Chrome / Google sign-in and Docs API errors into something a person can act on. */
function explainLoadError(raw: string): string {
  if (/bad client id|invalid_client|client id|OAuth2 not granted/i.test(raw)) {
    return `Google sign-in isn't set up for this copy of SparePage. Its extension ID is ${chrome.runtime.id}: register that ID on the Chrome extension OAuth client in Google Cloud, then click Connect again.`
  }
  if (/did not approve|denied|cancel|access_denied/i.test(raw)) {
    return 'Sign-in didn\'t finish. If Google said this app is still being tested, your account must be added as a test user. Then click Connect again.'
  }
  if (/documents\.get 403/.test(raw)) {
    return 'Google refused access to this document (403). Check that the Google Docs API is enabled for the project and that you can open this document.'
  }
  if (/documents\.get 404/.test(raw)) return 'Google couldn\'t find this document (404).'
  return `Couldn't open this document: ${raw}`
}

/** Cheap fingerprint (djb2 over the serialised model) to tell whether a doc changed. */
function docSignature(doc: DocModel): string {
  const text = JSON.stringify(doc)
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${text.length}:${h}`
}

function analyzeFlags(s: Session, doc: DocModel): Flag[] {
  return analyzeDoc(doc).filter((f) => !s.dismissed.has(f.id))
}

async function reanalyze(s: Session) {
  if (!s.doc) return
  s.flags = analyzeFlags(s, s.doc)
  await refreshPages(s)
}

// Exact page count from Docs' own PDF export when it works (it matches what prints);
// otherwise our layout estimate, which the UI labels "estimate".
async function refreshPages(s: Session) {
  if (!s.doc) return
  // The PDF export is the heavy call; skip it when nothing in the doc has changed.
  const sig = docSignature(s.doc)
  if (s.pagesExact && sig === s.pagesSig) return
  s.pagesSig = sig
  if (s.docId) {
    try {
      s.pages = await fetchExportPageCount(s.docId)
      s.pagesExact = true
      return
    } catch (err) {
      console.info('[SparePage] exact page count unavailable, using estimate:', err)
    }
  }
  s.pages = estimatePages(s.doc).pages
  s.pagesExact = false
}

function stateMessage(s: Session): Msg {
  return {
    type: 'STATE',
    doc: s.doc,
    flags: s.flags.filter((f) => !s.dismissed.has(f.id)),
    dismissed: [...s.dismissed],
    settings,
    docSource: s.docId ? 'live' : 'sample',
    pages: s.pages,
    pagesExact: s.pagesExact,
    ...(s.needsAccess ? { needsAccess: true } : {}),
    ...(s.notice ? { notice: s.notice } : {}),
  }
}

async function ensureReady(s: Session, interactive = false) {
  await loadSettings()
  if (!s.loaded) {
    await load(s, interactive)
    if (s.loaded) await reanalyze(s)
  }
}

const DEMO_URL = () => chrome.runtime.getURL('src/demo/index.html')

// Toolbar icon: on a Google Doc, open or close the in-editor overlay. Anywhere else, open
// the demo document so the user can see what SparePage does.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id != null && docIdFromUrl(tab.url)) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' } satisfies Msg)
    } catch {
      // The tab was open before SparePage was installed, so it has no content script.
      await chrome.action.setBadgeText({ tabId: tab.id, text: '↻' })
      await chrome.action.setTitle({ tabId: tab.id, title: 'Reload this tab to use SparePage' })
    }
    return
  }
  await chrome.tabs.create({ url: DEMO_URL() })
})

onMessage(async (msg: Msg, sender) => {
  switch (msg.type) {
    case 'GET_STATE': {
      const s = sessionFor(sender)
      await ensureReady(s, msg.connect === true)
      return stateMessage(s)
    }

    case 'REANALYZE': {
      const s = sessionFor(sender)
      await loadSettings()
      // Re-read the live doc so edits made in Docs since the last scan are picked up.
      if (s.docId) s.loaded = false
      // The background rescan keeps the user's dismissals; "Scan again" starts fresh.
      if (!msg.keepDismissed) s.dismissed.clear()
      if (s.loaded) await reanalyze(s)
      else await ensureReady(s)
      return stateMessage(s)
    }

    case 'APPLY_FLAG': {
      const s = sessionFor(sender)
      const flag = s.flags.find((f) => f.id === msg.flagId)
      if (flag && s.doc) {
        const action =
          msg.overrideText && flag.action.kind === 'replaceText'
            ? { ...flag.action, text: msg.overrideText }
            : flag.action
        s.doc = await s.backend.apply(s.doc, action)
        await reanalyze(s)
      }
      return stateMessage(s)
    }

    case 'APPLY_ALL': {
      // The robust loop lives in applyAllFixes (testable, signature-based). It respects the
      // user's earlier dismissals but never adds to them.
      const s = sessionFor(sender)
      if (s.doc) {
        const result = await applyAllFixes(
          s.doc,
          async (d) => analyzeFlags(s, d),
          (d, a) => s.backend.apply(d, a),
        )
        s.doc = result.doc
        s.flags = result.flags
        await refreshPages(s)
      }
      return stateMessage(s)
    }

    case 'DISMISS_FLAG': {
      const s = sessionFor(sender)
      s.dismissed.add(msg.flagId)
      return stateMessage(s)
    }

    case 'REVEAL_FLAG': {
      // Tell the page where the flag is; the page that owns the overlay does the scrolling
      // (Docs' native Find in a live doc, or the demo page's own document view).
      const s = sessionFor(sender)
      const flag = s.flags.find((f) => f.id === msg.flagId)
      if (!flag || !s.doc) return undefined
      const { fraction } = lineLocation(s.doc, flag.range.start)
      const text = flatten(s.doc).slice(flag.range.start, flag.range.end)
      return { type: 'SCROLL_TO_FLAG', text, fraction } satisfies Msg
    }

    case 'UPDATE_SETTINGS': {
      await loadSettings()
      settings = { ...settings, ...msg.settings }
      await chrome.storage.local.set({ settings })
      return stateMessage(sessionFor(sender))
    }

    case 'GET_PRINT_SUMMARY': {
      const s = sessionFor(sender)
      await ensureReady(s)
      return {
        type: 'PRINT_SUMMARY',
        pages: s.pages,
        pagesExact: s.pagesExact,
        unresolved: s.flags
          .filter((f) => !s.dismissed.has(f.id))
          .map((f) => ({ type: f.type, title: f.title })),
        settings,
      } satisfies Msg
    }

    default:
      return undefined
  }
})
