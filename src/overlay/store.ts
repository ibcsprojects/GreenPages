import { create } from 'zustand'
import type { DocModel } from '../lib/docModel'
import type { Flag } from '../lib/analyzer/types'
import { sendMessage, type Msg, type Settings, DEFAULT_SETTINGS } from '../lib/messaging'

/** How the flag list is ordered: by position in the doc, or by biggest page saving first. */
export type SortMode = 'document' | 'savings'

interface OverlayState {
  /** Whether the issue panel is open over the editor. */
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void

  doc: DocModel | null
  flags: Flag[]
  settings: Settings
  loading: boolean
  /** UI-only ordering of the flag list. Not sent to the worker. */
  sortMode: SortMode
  setSortMode: (mode: SortMode) => void
  /** Current page count from the worker. */
  pages: number
  /** True when `pages` is exact (Docs' own PDF export), false when it's our estimate. */
  pagesExact: boolean
  /** Whether we're analyzing the live doc or the offline sample. */
  docSource: 'live' | 'sample' | null
  /** The user hasn't connected SparePage to Google Docs yet. */
  needsAccess: boolean
  /** A heads-up from the worker (e.g. couldn't open the doc), or null. */
  notice: string | null
  /** The last operation's error message, shown as a banner until the next action. */
  error: string | null
  /** Per-flag busy state so a card can show progress while applying. */
  busy: Record<string, boolean>

  init: () => Promise<void>
  /** User clicked Connect: allows Google's one-time sign-in window. */
  connect: () => Promise<void>
  reanalyze: () => Promise<void>
  /** Re-read the doc in the background (no spinner, keeps dismissals, ignores failures). */
  refresh: () => Promise<void>
  apply: (flagId: string, overrideText?: string) => Promise<void>
  /** Apply every outstanding flag in one go. */
  applyAll: () => Promise<void>
  dismiss: (flagId: string) => Promise<void>
  reveal: (flagId: string) => Promise<void>
  updateSettings: (s: Partial<Settings>) => Promise<void>
}

type SetState = (p: Partial<OverlayState>) => void

/** How the host page scrolls to a flag: Docs' Find in a live doc, the demo's own view. */
type RevealHandler = (text: string, fraction: number) => void
let revealHandler: RevealHandler | null = null
export function setRevealHandler(fn: RevealHandler): void {
  revealHandler = fn
}

function applyState(set: SetState, msg: Extract<Msg, { type: 'STATE' }>) {
  set({
    doc: msg.doc,
    flags: msg.flags,
    settings: msg.settings,
    pages: msg.pages ?? 0,
    pagesExact: msg.pagesExact ?? false,
    docSource: msg.docSource ?? null,
    needsAccess: msg.needsAccess ?? false,
    notice: msg.notice ?? null,
    error: null,
    loading: false,
  })
}

/**
 * Apply a worker response. The worker answers with fresh STATE or, when a handler threw,
 * an ERROR; surface that as a banner instead of reading `.doc` off an error and crashing.
 */
function handleResponse(set: SetState, msg: Msg | undefined) {
  if (!msg) set({ loading: false })
  else if (msg.type === 'ERROR') set({ error: msg.message, loading: false })
  else if (msg.type === 'STATE') applyState(set, msg)
}

export const useStore = create<OverlayState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),

  doc: null,
  flags: [],
  settings: { ...DEFAULT_SETTINGS },
  loading: true,
  pages: 0,
  pagesExact: false,
  docSource: null,
  needsAccess: false,
  notice: null,
  error: null,
  busy: {},
  sortMode: 'document',

  setSortMode: (mode) => set({ sortMode: mode }),

  init: async () => {
    set({ loading: true, error: null })
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'GET_STATE' }))
    } catch (err) {
      set({ error: errMessage(err), loading: false })
    }
  },

  connect: async () => {
    set({ loading: true, error: null })
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'GET_STATE', connect: true }))
    } catch (err) {
      set({ error: errMessage(err), loading: false })
    }
  },

  reanalyze: async () => {
    set({ loading: true, error: null })
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'REANALYZE' }))
    } catch (err) {
      set({ error: errMessage(err), loading: false })
    }
  },

  refresh: async () => {
    try {
      const msg = await sendMessage<Msg>({ type: 'REANALYZE', keepDismissed: true })
      if (msg?.type === 'STATE') applyState(set, msg)
    } catch {
      // A background check that fails just leaves the last result in place.
    }
  },

  apply: async (flagId, overrideText) => {
    set({ busy: { ...get().busy, [flagId]: true }, error: null })
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'APPLY_FLAG', flagId, overrideText }))
    } catch (err) {
      // A rejected port (e.g. the worker died mid-edit) must still clear the busy state
      // and tell the user, not leave the card stuck on "Applying…".
      set({ error: errMessage(err) })
    } finally {
      const busy = { ...get().busy }
      delete busy[flagId]
      set({ busy })
    }
  },

  applyAll: async () => {
    set({ loading: true, error: null })
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'APPLY_ALL' }))
    } catch (err) {
      set({ error: errMessage(err), loading: false })
    }
  },

  dismiss: async (flagId) => {
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'DISMISS_FLAG', flagId }))
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  // The worker says where the flag is; the page that mounted the overlay scrolls to it.
  reveal: async (flagId) => {
    const res = await sendMessage<Msg | undefined>({ type: 'REVEAL_FLAG', flagId }).catch(() => undefined)
    if (res?.type === 'SCROLL_TO_FLAG') revealHandler?.(res.text, res.fraction)
  },

  updateSettings: async (s) => {
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'UPDATE_SETTINGS', settings: s }))
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },
}))

function errMessage(err: unknown): string {
  return String((err as Error)?.message ?? err)
}
