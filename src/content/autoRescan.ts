// Keeps the issue list current while the user works, so the print check can decide
// instantly (from what we already know) whether there is anything worth warning about.
// A rescan runs a few seconds after the user stops editing, never more than once every 15s.

import { useStore } from '../overlay/store'
import { watchDocWindows } from './docWindows'

const QUIET_MS = 5000
const MIN_GAP_MS = 15000

let timer: number | undefined
let lastRun = 0

function schedule(): void {
  window.clearTimeout(timer)
  const wait = Math.max(QUIET_MS, lastRun + MIN_GAP_MS - Date.now())
  timer = window.setTimeout(run, wait)
}

async function run(): Promise<void> {
  const s = useStore.getState()
  if (document.hidden || s.needsAccess || !s.doc || s.loading) return
  lastRun = Date.now()
  await s.refresh()
}

/** A keystroke or click that could have changed the document (not our own panel). */
function looksLikeEdit(e: Event): boolean {
  if (!e.isTrusted) return false
  if (e.composedPath().some((n) => (n as Element).id === 'sparepage-overlay')) return false
  if (e.type === 'mouseup') return true
  const k = e as KeyboardEvent
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(k.key)) return false
  if (k.ctrlKey || k.metaKey) return ['v', 'x', 'z', 'y', 'b', 'i', 'u'].includes(k.key.toLowerCase())
  return true
}

export function installAutoRescan(): void {
  watchDocWindows((win) => {
    const onEdit = (e: Event) => {
      if (looksLikeEdit(e)) schedule()
    }
    win.addEventListener('keydown', onEdit, true)
    win.addEventListener('mouseup', onEdit, true)
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule()
  })
}
