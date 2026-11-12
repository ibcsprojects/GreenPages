// Print intercept. Catches Ctrl/Cmd+P inside a Google Doc and shows the eco check *before*
// Docs opens its print dialog, but only when there is something to warn about.
//
// The decision is made synchronously from what the overlay already knows. An async lookup
// would not finish before the browser's print dialog opened, which is how the card used to
// appear only after the dialog was cancelled. If the doc is clean, or we haven't checked
// it yet, the shortcut is left alone and Docs prints as normal.

import { useStore } from '../overlay/store'
import { showPrintModal, type PrintSummary } from './PrintModal'
import { pressShortcut, watchDocWindows } from './docWindows'

let modalOpen = false
let bypassUntil = 0

function isPrintShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p'
}

/** What to show, or null when there is nothing worth interrupting a print for. */
function summaryToShow(): PrintSummary | null {
  const s = useStore.getState()
  if (s.needsAccess || !s.doc || s.flags.length === 0) return null
  return {
    pages: s.pages,
    pagesExact: s.pagesExact,
    unresolved: s.flags.map((f) => ({ type: f.type, title: f.title })),
    settings: s.settings,
  }
}

async function review(summary: PrintSummary, onReview: () => void): Promise<void> {
  modalOpen = true
  try {
    const result = await showPrintModal(summary)
    if (result === 'print') {
      // Hand the shortcut back to Docs; the flag stops us catching our own keypress.
      bypassUntil = Date.now() + 1500
      pressShortcut('p')
    } else if (result === 'review') {
      onReview()
    }
    // 'cancel' returns to editing.
  } finally {
    modalOpen = false
  }
}

export function installPrintIntercept({ onReview }: { onReview: () => void }): void {
  watchDocWindows((win) => {
    win.addEventListener(
      'keydown',
      (e) => {
        if (!isPrintShortcut(e) || Date.now() < bypassUntil) return
        if (modalOpen) {
          e.preventDefault()
          e.stopImmediatePropagation()
          return
        }
        const summary = summaryToShow()
        if (!summary) return
        e.preventDefault()
        e.stopImmediatePropagation()
        void review(summary, onReview)
      },
      true,
    )
  })
}
