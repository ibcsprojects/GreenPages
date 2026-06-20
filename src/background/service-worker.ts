// The single source of truth. Holds the active DocModel, the current flags, dismissed
// ids, and settings; serves them to the side panel and the content script. Applying a
// fix runs through the EditBackend and re-analyzes so flags stay consistent.

import { SAMPLE_DOC, type DocModel } from '../lib/docModel'
import type { Flag } from '../lib/analyzer/types'
import { analyze } from '../lib/analyzer/client'
import { MockDocsBackend, GoogleDocsBackend, type EditBackend } from '../lib/docBackend'
import { getActiveGoogleDocId, fetchGoogleDoc } from '../lib/googleDocs'
import { estimatePages } from '../lib/pageEstimate'
import {
  DEFAULT_SETTINGS,
  onMessage,
  type Msg,
  type Settings,
} from '../lib/messaging'

interface State {
  doc: DocModel
  flags: Flag[]
  dismissed: Set<string>
  settings: Settings
}

// Defaults to the offline sample + in-memory backend. When the panel opens on a real
// Google Doc, ensureDoc() swaps in the live document and the Docs API backend.
let backend: EditBackend = new MockDocsBackend()
let liveLoaded = false

const state: State = {
  doc: SAMPLE_DOC,
  flags: [],
  dismissed: new Set(),
  settings: { ...DEFAULT_SETTINGS },
}

async function loadSettings() {
  const saved = await chrome.storage.local.get('settings')
  if (saved.settings) state.settings = { ...DEFAULT_SETTINGS, ...saved.settings }
}

// One-shot: if the active tab is a Google Doc, load it via the Docs API (prompting for
// OAuth the first time). Any failure (not a doc, auth declined, network) leaves the
// offline sample in place so the product always works.
async function ensureDoc() {
  if (liveLoaded) return
  try {
    const docId = await getActiveGoogleDocId()
    if (!docId) return
    state.doc = await fetchGoogleDoc(docId)
    backend = new GoogleDocsBackend(docId)
    liveLoaded = true
  } catch (err) {
    console.warn('[GreenPages] Docs API load failed, using sample doc:', err)
  }
}

async function reanalyze() {
  const flags = await analyze(state.doc, {
    useAI: state.settings.useAI,
    backendUrl: state.settings.backendUrl,
  })
  state.flags = flags.filter((f) => !state.dismissed.has(f.id))
}

function visibleFlags(): Flag[] {
  return state.flags.filter((f) => !state.dismissed.has(f.id))
}

function stateMessage(): Msg {
  return {
    type: 'STATE',
    doc: state.doc,
    flags: visibleFlags(),
    dismissed: [...state.dismissed],
    settings: state.settings,
  }
}

// Toolbar icon opens the side panel on the active tab.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId != null) {
    await chrome.sidePanel.open({ windowId: tab.windowId })
  }
})

// Allow the side panel to be opened from the action button.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

onMessage(async (msg: Msg, sender) => {
  switch (msg.type) {
    case 'GET_STATE':
      if (state.flags.length === 0) {
        await loadSettings()
        await ensureDoc()
        await reanalyze()
      }
      return stateMessage()

    case 'REANALYZE':
      await ensureDoc()
      state.dismissed.clear()
      await reanalyze()
      return stateMessage()

    case 'APPLY_FLAG': {
      const flag = state.flags.find((f) => f.id === msg.flagId)
      if (flag) {
        const action =
          msg.overrideText && flag.action.kind === 'replaceText'
            ? { ...flag.action, text: msg.overrideText }
            : flag.action
        state.doc = await backend.apply(state.doc, action)
        state.dismissed.add(flag.id)
        await reanalyze()
      }
      return stateMessage()
    }

    case 'DISMISS_FLAG':
      state.dismissed.add(msg.flagId)
      return stateMessage()

    case 'UPDATE_SETTINGS':
      state.settings = { ...state.settings, ...msg.settings }
      await chrome.storage.local.set({ settings: state.settings })
      await reanalyze()
      return stateMessage()

    case 'OPEN_PANEL': {
      const windowId = sender.tab?.windowId
      if (windowId != null) await chrome.sidePanel.open({ windowId })
      return { ok: true }
    }

    case 'GET_PRINT_SUMMARY': {
      if (state.flags.length === 0) {
        await loadSettings()
        await ensureDoc()
        await reanalyze()
      }
      const { pages } = estimatePages(state.doc)
      return {
        type: 'PRINT_SUMMARY',
        pages,
        unresolved: visibleFlags().map((f) => ({ type: f.type, title: f.title })),
        settings: state.settings,
      } satisfies Msg
    }

    default:
      return undefined
  }
})
