// Typed message protocol shared by the side panel, content script, and service worker.
// All payloads are plain JSON (DocModel, Flag, etc. are already serializable).

import type { DocModel } from './docModel'
import type { Flag } from './analyzer/types'

export type Settings = {
  paperSize: 'Letter' | 'A4'
  duplexReminder: boolean
  /** Use the Gemini backend when configured, else local rules. */
  useAI: boolean
  backendUrl: string
}

export const DEFAULT_SETTINGS: Settings = {
  paperSize: 'Letter',
  duplexReminder: true,
  useAI: false,
  backendUrl: '',
}

export type Msg =
  // side panel ⇄ worker
  | { type: 'GET_STATE' }
  | { type: 'STATE'; doc: DocModel; flags: Flag[]; dismissed: string[]; settings: Settings }
  | { type: 'REANALYZE' }
  | { type: 'APPLY_FLAG'; flagId: string; overrideText?: string }
  | { type: 'DISMISS_FLAG'; flagId: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  // content script ⇄ worker
  | { type: 'OPEN_PANEL' }
  | { type: 'GET_PRINT_SUMMARY' }
  | {
      type: 'PRINT_SUMMARY'
      pages: number
      unresolved: { type: string; title: string }[]
      settings: Settings
    }
  | { type: 'PRINT_INTERCEPT' } // content → worker: user hit Ctrl+P

/** Thrown when the content script outlives the extension (reload/update/disable). */
export class ExtensionContextInvalidatedError extends Error {
  constructor() {
    super('Extension context invalidated — reload the page to reconnect GreenPages.')
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
      result.then((r) => sendResponse(r))
      return true // keep the channel open for the async response
    }
    return false
  })
}
