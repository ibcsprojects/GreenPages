// Typed message protocol shared by the in-editor overlay (content script), the demo page,
// and the service worker. All payloads are plain JSON (DocModel, Flag, etc. are already
// serializable).

import type { DocModel } from './docModel'
import type { Flag } from './analyzer/types'

export type Settings = {
  /** Remind the user to print double-sided in the print check. */
  duplexReminder: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  duplexReminder: true,
}

export type Msg =
  // overlay ⇄ worker. The worker works out which document a request is about from the
  // sender's tab, so these messages never carry a document id.
  | {
      type: 'GET_STATE'
      /** True only when the user clicked to connect: allows Google's sign-in window. */
      connect?: boolean
    }
  | {
      type: 'STATE'
      /** The analyzed document, or null when it isn't loaded (yet). */
      doc: DocModel | null
      flags: Flag[]
      dismissed: string[]
      settings: Settings
      /** Whether we're analyzing the user's live Google Doc or the bundled sample. */
      docSource?: 'live' | 'sample'
      /** Current page count. */
      pages?: number
      /** True when `pages` came from Docs' own PDF export; false when it's our estimate. */
      pagesExact?: boolean
      /** The user hasn't connected SparePage to Google Docs yet (no UI was shown). */
      needsAccess?: boolean
      /** A user-facing heads-up, e.g. "couldn't open your doc". */
      notice?: string
    }
  /** A handler threw: surfaced to the overlay instead of vanishing into a dead port. */
  | { type: 'ERROR'; message: string }
  | { type: 'REANALYZE'; keepDismissed?: boolean }
  | { type: 'APPLY_FLAG'; flagId: string; overrideText?: string }
  | { type: 'APPLY_ALL' }
  | { type: 'DISMISS_FLAG'; flagId: string }
  | { type: 'REVEAL_FLAG'; flagId: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  // worker → page: the toolbar icon was clicked, open or close the overlay.
  | { type: 'TOGGLE_OVERLAY' }
  // worker → page: reveal a flagged span. `fraction` (0..1 of the doc's height) drives a
  // guaranteed proportional scroll; `text` drives Docs' native Find for an exact jump.
  | { type: 'SCROLL_TO_FLAG'; text: string; fraction: number }
  | { type: 'GET_PRINT_SUMMARY' }
  | {
      type: 'PRINT_SUMMARY'
      pages: number
      pagesExact: boolean
      unresolved: { type: string; title: string }[]
      settings: Settings
    }

/** Thrown when the content script outlives the extension (reload/update/disable). */
export class ExtensionContextInvalidatedError extends Error {
  constructor() {
    super('SparePage was updated. Reload this page to reconnect.')
    this.name = 'ExtensionContextInvalidatedError'
  }
}

/**
 * True while the content script is still connected to a live extension runtime.
 * `chrome.runtime.id` becomes undefined once the context is invalidated.
 */
export function isExtensionContextValid(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id
}

export function sendMessage<T = unknown>(msg: Msg): Promise<T> {
  // After an extension reload, an orphaned content script still runs in the page
  // but chrome.runtime is dead. Calling sendMessage then throws synchronously, so
  // we convert that into a normal rejected promise callers can catch.
  if (!isExtensionContextValid()) {
    return Promise.reject(new ExtensionContextInvalidatedError())
  }
  try {
    return chrome.runtime.sendMessage(msg) as Promise<T>
  } catch (err) {
    return Promise.reject(
      /context invalidated/i.test(String((err as Error)?.message))
        ? new ExtensionContextInvalidatedError()
        : (err as Error),
    )
  }
}

export function onMessage(
  handler: (msg: Msg, sender: chrome.runtime.MessageSender) => void | Promise<unknown>,
) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const result = handler(msg as Msg, sender)
    if (result instanceof Promise) {
      // A rejected handler must still answer the port, or the caller's `await sendMessage`
      // hangs or rejects with "message port closed" and the failure is invisible. Convert
      // any throw into an ERROR response the overlay can show.
      result.then(
        (r) => sendResponse(r),
        (err) =>
          sendResponse({
            type: 'ERROR',
            message: String((err as Error)?.message ?? err),
          } satisfies Msg),
      )
      return true // keep the channel open for the async response
    }
    return false
  })
}
