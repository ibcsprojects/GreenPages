// The demo page: what the toolbar icon opens anywhere other than a Google Doc. It shows a
// deliberately wasteful sample document with the real overlay mounted over it, so people
// can try every fix without connecting a Google account. Edits apply to the sample only.

import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import '../styles/index.css'
import { mountOverlay } from '../overlay/mount'
import { setRevealHandler, useStore } from '../overlay/store'
import { paragraphText, type DocModel, type Paragraph } from '../lib/docModel'

const PX_PER_PT = 4 / 3

function DemoPage() {
  const doc = useStore((s) => s.doc)
  const [flashId, setFlashId] = useState<string | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  // "Show" in the overlay: scroll the sample to the flagged paragraph and mark it briefly.
  useEffect(() => {
    setRevealHandler((text, fraction) => {
      const current = useStore.getState().doc
      if (!current) return
      const needle = text.replace(/\s+/g, ' ').trim().slice(0, 40)
      const para =
        current.paragraphs.find(
          (p) => needle && paragraphText(p).replace(/\s+/g, ' ').includes(needle),
        ) ?? current.paragraphs[Math.floor(fraction * (current.paragraphs.length - 1))]
      if (!para) return
      const el = pageRef.current?.querySelector<HTMLElement>(`[data-pid="${para.id}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setFlashId(para.id)
      window.setTimeout(() => setFlashId(null), 1200)
    })
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-full pb-24">
        <header className="sticky top-0 z-10 border-b border-black/5 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
            <img src={chrome.runtime.getURL('icons/icon48.png')} alt="" className="h-7 w-7" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-bark-900">Sparepage demo</div>
              <div className="text-xs text-bark-700/80">
                A sample document full of print waste. Try the fixes in the panel.
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto mt-8 max-w-5xl px-6">
          {doc ? (
            <DocView doc={doc} flashId={flashId} pageRef={pageRef} />
          ) : (
            <p className="text-sm text-bark-700/80">Loading the sample…</p>
          )}
          <p className="mx-auto mt-6 max-w-[640px] text-center text-xs text-bark-700/80">
            To check your own writing, open any Google Doc. Sparepage appears in the
            bottom-right corner of the editor.
          </p>
        </main>
      </div>
    </MotionConfig>
  )
}

function DocView({
  doc,
  flashId,
  pageRef,
}: {
  doc: DocModel
  flashId: string | null
  pageRef: React.RefObject<HTMLDivElement>
}) {
  const widthPt = doc.pageWidthPt ?? 612
  const m = doc.margins ?? { topPt: 72, bottomPt: 72, leftPt: 72, rightPt: 72 }
  return (
    <div
      ref={pageRef}
      className="mx-auto bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.06)]"
      style={{
        width: widthPt * PX_PER_PT,
        maxWidth: '100%',
        padding: `${m.topPt * PX_PER_PT}px ${m.rightPt * PX_PER_PT}px ${m.bottomPt * PX_PER_PT}px ${m.leftPt * PX_PER_PT}px`,
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#202124',
      }}
    >
      <h1 className="sr-only">{doc.title}</h1>
      {doc.paragraphs.map((p) => (
        <Para key={p.id} p={p} flash={flashId === p.id} />
      ))}
    </div>
  )
}

function Para({ p, flash }: { p: Paragraph; flash: boolean }) {
  const text = paragraphText(p)
  let body: React.ReactNode
  if (p.kind === 'pageBreak') {
    body = (
      <div className="my-3 border-t-2 border-dashed border-black/20 pt-1 text-center text-[11px] text-black/60">
        Page break
      </div>
    )
  } else if (p.isRule) {
    body = <hr className="my-2 border-black/30" />
  } else if (p.kind === 'table') {
    body = (
      <div className="my-1 rounded border border-black/20 px-2 py-1 text-[13px] text-black/50">
        Table
      </div>
    )
  } else {
    const runs = p.runs.map((r, i) => (
      <span
        key={i}
        style={{
          fontSize: `${r.fontSize * PX_PER_PT}px`,
          fontWeight: r.bold ? 700 : undefined,
          fontStyle: r.italic ? 'italic' : undefined,
          textDecoration: r.underline ? 'underline' : undefined,
          backgroundColor: r.highlightColor ?? undefined,
        }}
      >
        {r.text}
      </span>
    ))
    const images = p.images ?? []
    body = (
      <>
        {images.map((img, i) => (
          <div
            key={i}
            className="grid place-items-center rounded-sm bg-[linear-gradient(135deg,#d7ecdd,#b8dcc3)] text-xs font-medium text-leaf-900"
            style={{
              width: img.widthPt * PX_PER_PT,
              height: img.heightPt * PX_PER_PT,
              maxWidth: '100%',
            }}
          >
            Chart
          </div>
        ))}
        {p.kind === 'bullet' ? (
          <div className="flex gap-3 pl-6">
            <span aria-hidden>•</span>
            <span>{runs}</span>
          </div>
        ) : text.trim() || images.length === 0 ? (
          <div style={{ minHeight: '1.15em' }}>{runs}</div>
        ) : null}
      </>
    )
  }

  return (
    <div
      data-pid={p.id}
      className={`relative leading-[1.15] ${p.kind === 'heading' ? 'mb-2 mt-5' : ''}`}
      style={{ fontSize: `${11 * PX_PER_PT}px` }}
    >
      <AnimatePresence>
        {flash && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-x-2 -inset-y-1 rounded bg-leaf-200/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.28 } }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </AnimatePresence>
      <div className="relative">{body}</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoPage />
  </StrictMode>,
)

// The same overlay the content script mounts in Google Docs, opened straight away here.
mountOverlay()
useStore.getState().setOpen(true)
