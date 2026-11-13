// The in-editor overlay: a small tab attached to the right edge of the document page the reader
// is on (it follows them down the document and onto the next page), and an issue panel that
// opens over the document from the editor's bottom-right corner. Rendered inside a Shadow DOM by
// mount.tsx, so Google Docs' styles can't reach it and ours can't leak out.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { canOpenHistory, useStore } from './store'
import { FlagList } from './components/FlagList'
import { EcoScore } from './components/EcoScore'
import { SortMenu } from './components/SortMenu'
import { logoUrl } from './logo'
import { panelWidth, tabPosition, PANEL_EDGE, PANEL_W, type Box } from './tabPosition'

/** The tallest the panel gets, and the least it shrinks to in a very short window. */
const PANEL_MAX = 540
const PANEL_MIN = 260

// Enter: ease-out, under 200ms, transform + opacity only.
const EASE_OUT = [0.16, 1, 0.3, 1] as const

export function Overlay({ anchor }: { anchor?: () => DOMRect | null }) {
  const open = useStore((s) => s.open)
  const init = useStore((s) => s.init)
  const offset = useEditorCorner(anchor)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="pointer-events-none fixed z-[2147483000] flex flex-col items-end font-sans text-bark-900 antialiased"
        style={{ right: offset.right, bottom: offset.bottom }}
      >
        <AnimatePresence>{open && <Panel key="panel" maxHeight={offset.maxHeight} width={offset.width} />}</AnimatePresence>
      </div>
      <PageTab anchor={anchor} />
    </MotionConfig>
  )
}

/**
 * Keep the overlay inside the editor: measure the editor's box and sit in from its
 * bottom-right corner, clear of Docs' own right-hand toolbar. Falls back to the viewport.
 */
function useEditorCorner(anchor?: () => DOMRect | null) {
  // maxHeight keeps the panel's top below Docs' toolbar, and width keeps it in the gutter beside
  // the page instead of over the text.
  const [offset, setOffset] = useState({ right: PANEL_EDGE, bottom: 24, maxHeight: PANEL_MAX, width: PANEL_W })
  useEffect(() => {
    if (!anchor) return
    const place = () => {
      const r = anchor()
      if (!r || r.width === 0) return
      const right = Math.max(16, Math.round(window.innerWidth - r.right + PANEL_EDGE))
      const bottom = Math.max(16, Math.round(window.innerHeight - r.bottom + 24))
      const room = window.innerHeight - bottom - Math.max(r.top, 0) - 12
      const view: Box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      const next = {
        right,
        bottom,
        maxHeight: Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(room))),
        width: panelWidth(view, findPages()),
      }
      setOffset((cur) =>
        cur.right === next.right && cur.bottom === next.bottom && cur.maxHeight === next.maxHeight && cur.width === next.width
          ? cur
          : next,
      )
    }
    place()
    window.addEventListener('resize', place)
    const timer = window.setInterval(place, 2000) // Docs resizes the editor on its own
    return () => {
      window.removeEventListener('resize', place)
      window.clearInterval(timer)
    }
  }, [anchor])
  return offset
}

/** The page boxes Docs lays out (any order). Docs paints text to a canvas, but each page is
 *  still a positioned element, which is all the placement needs. The demo page tags its page. */
const PAGE_SELECTOR = '.kix-page-paginated, .kix-page, [data-sparepage-page]'

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })

function findPages(): Box[] {
  return Array.from(document.querySelectorAll(PAGE_SELECTOR))
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map(toBox)
}

/**
 * Keep the tab on the right edge of the current page. Only `transform` changes as the reader
 * scrolls, so it never forces a layout. Scroll events don't bubble, so one capturing listener
 * catches the editor's scroller wherever Docs puts it; an interval covers zoom and layout
 * changes that fire no event.
 */
function usePageTab(anchor?: () => DOMRect | null) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const place = () => {
      frame = 0
      const rect = anchor?.()
      const view: Box =
        rect && rect.width > 0
          ? toBox(rect)
          : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
      const { x, y } = tabPosition(view, findPages())
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      el.style.visibility = 'visible' // hidden until the first placement, so it never flashes at 0,0
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    place()
    document.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    const timer = window.setInterval(place, 1000)
    return () => {
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.clearInterval(timer)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [anchor])
  return ref
}

function PageTab({ anchor }: { anchor?: () => DOMRect | null }) {
  const open = useStore((s) => s.open)
  const toggle = useStore((s) => s.toggle)
  const flags = useStore((s) => s.flags)
  const loading = useStore((s) => s.loading)
  const needsAccess = useStore((s) => s.needsAccess)
  const doc = useStore((s) => s.doc)
  const ref = usePageTab(anchor)

  const count = flags.length
  const label = needsAccess
    ? 'SparePage: connect to check this document'
    : loading && !doc
      ? 'SparePage: checking this document'
      : `SparePage: ${count} print issue${count === 1 ? '' : 's'}`

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-[2147483000] font-sans text-bark-900 antialiased"
      style={{ visibility: 'hidden', willChange: 'transform' }}
    >
      {/* While the panel is open it has its own close button, so the tab steps aside. */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="tab"
            type="button"
            onClick={toggle}
            aria-label={label}
            aria-expanded={open}
            title={label}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.12, ease: EASE_OUT }}
            className="pointer-events-auto flex h-[76px] w-9 flex-col items-center justify-center gap-2 rounded-r-2xl border border-l-[3px] border-leaf-200 border-l-leaf-600 bg-white shadow-lift hover:bg-leaf-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-600"
          >
            <img src={logoUrl()} alt="" className="h-[22px] w-[22px]" />
            {!needsAccess && doc && (
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold leading-none text-white ${
                  count === 0 ? 'bg-leaf-600' : 'bg-clay-600'
                }`}
                aria-hidden
              >
                {count === 0 ? '✓' : count > 9 ? '9+' : count}
              </span>
            )}
            {needsAccess && <span className="h-3 w-3 rounded-full bg-bark-700/40" aria-hidden />}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

function Panel({ maxHeight, width }: { maxHeight: number; width: number }) {
  const setOpen = useStore((s) => s.setOpen)
  const needsAccess = useStore((s) => s.needsAccess)
  const ref = useRef<HTMLDivElement>(null)

  // Escape closes the panel while focus is inside it.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [setOpen])

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label="SparePage print check"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12, ease: 'easeIn' } }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      style={{ transformOrigin: 'bottom right', maxHeight, width }}
      className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-leaf-100 bg-paper shadow-panel"
    >
      <PanelHeader />
      {needsAccess ? (
        <ConnectPrompt />
      ) : (
        <>
          <EcoScore />
          <Banner />
          <AppliedNote />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <FlagList />
          </div>
          <ApplyAllBar />
        </>
      )}
    </motion.div>
  )
}

function PanelHeader() {
  const setOpen = useStore((s) => s.setOpen)
  const reanalyze = useStore((s) => s.reanalyze)
  const loading = useStore((s) => s.loading)
  const needsAccess = useStore((s) => s.needsAccess)
  const docSource = useStore((s) => s.docSource)

  return (
    <header className="flex items-center gap-1.5 border-b border-leaf-100 bg-white px-3 py-1.5">
      <img src={logoUrl()} alt="" className="h-5 w-5" />
      <div className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-bark-900">
        SparePage
        {docSource === 'sample' && <span className="ml-1.5 font-normal text-bark-700/80">Sample</span>}
      </div>
      {!needsAccess && (
        <>
          <SortMenu />
          <IconButton label={loading ? 'Scanning' : 'Scan again'} onClick={reanalyze} disabled={loading}>
            <path d="M15.5 6.5A6 6 0 1 0 16 11" strokeLinecap="round" />
            <path d="M16 3.5v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round" />
          </IconButton>
        </>
      )}
      <IconButton label="Close" onClick={() => setOpen(false)}>
        <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" strokeLinecap="round" />
      </IconButton>
    </header>
  )
}

export function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-bark-700/80 hover:bg-leaf-50 hover:text-leaf-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-600 disabled:opacity-40"
    >
      <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        {children}
      </svg>
    </button>
  )
}

function ConnectPrompt() {
  const connect = useStore((s) => s.connect)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  // A failed sign-in comes back as a notice from the worker; show it here, or a click on
  // Connect looks like it did nothing.
  const notice = useStore((s) => s.notice)
  const problem = error ?? notice
  return (
    <div className="px-4 pb-4 pt-3.5">
      <h2 className="text-[15px] font-semibold text-bark-900">Check this document before you print</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-bark-700/80">
        SparePage reads this document to find highlights, oversized text, blank pages and wordy
        paragraphs, then applies only the fixes you accept. It runs in your browser, and nothing
        is sent to us.
      </p>
      {problem && (
        <p role="alert" className="mt-3 rounded-lg bg-clay-50 px-3 py-2 text-[12px] leading-relaxed text-clay-700">
          {problem}
        </p>
      )}
      <button
        type="button"
        onClick={connect}
        disabled={loading}
        className="mt-3.5 w-full rounded-xl bg-leaf-700 px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-leaf-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-700 disabled:opacity-60"
      >
        {loading ? 'Connecting…' : 'Connect to Google Docs'}
      </button>
      <p className="mt-2 text-center text-[11px] text-bark-700/80">
        Google asks once. You can revoke access at any time.
      </p>
    </div>
  )
}

// Surfaces what used to fail silently: a hard error from the last action, or a heads-up
// from the worker (e.g. the document couldn't be opened).
function Banner() {
  const error = useStore((s) => s.error)
  const notice = useStore((s) => s.notice)
  const message = error ?? notice
  if (!message) return null
  return (
    <div
      role="status"
      className={`border-b px-3.5 py-2 text-[12px] leading-relaxed ${
        error ? 'border-clay-100 bg-clay-50 text-clay-700' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      {message}
    </div>
  )
}

// After a fix, remind people that Docs keeps every earlier version. Docs doesn't treat edits
// made by an extension as the person's own typing, so Ctrl+Z may not undo them; version
// history always can.
function AppliedNote() {
  const justApplied = useStore((s) => s.justApplied)
  const error = useStore((s) => s.error)
  const dismiss = useStore((s) => s.dismissApplied)
  const openHistory = useStore((s) => s.openHistory)
  if (!justApplied || error || !canOpenHistory()) return null
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-leaf-100 bg-leaf-50 px-3.5 py-2 text-[12px] leading-snug text-bark-800"
    >
      <span className="min-w-0 flex-1">Applied. Docs keeps every earlier version if you want to go back.</span>
      <button
        type="button"
        onClick={openHistory}
        className="shrink-0 rounded-md px-2 py-1 font-semibold text-leaf-800 hover:bg-leaf-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-700"
      >
        Version history
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md px-1.5 py-1 text-bark-700/80 hover:bg-leaf-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-700"
      >
        ×
      </button>
    </div>
  )
}

// Footer: one button that applies every outstanding fix at once.
function ApplyAllBar() {
  const flags = useStore((s) => s.flags)
  const loading = useStore((s) => s.loading)
  const applyAll = useStore((s) => s.applyAll)
  // Fixes that leave out whole sentences are applied one at a time, after reading them.
  const count = flags.filter((f) => !f.reviewFirst).length
  if (count === 0) return null
  return (
    <div className="border-t border-leaf-100 bg-white px-3 py-2.5">
      <button
        type="button"
        onClick={() => applyAll()}
        disabled={loading}
        className="w-full rounded-xl bg-leaf-700 px-3 py-2 text-[13px] font-semibold text-white hover:bg-leaf-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Working…' : `Apply all ${count} fix${count === 1 ? '' : 'es'}`}
      </button>
    </div>
  )
}
