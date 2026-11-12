import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, type SortMode } from '../store'

const OPTIONS: { value: SortMode; label: string; hint: string }[] = [
  { value: 'savings', label: 'Biggest saving first', hint: 'Most paper saved at the top' },
  { value: 'document', label: 'Order in document', hint: 'Top to bottom' },
]

/** A small sort button + menu that picks how the issue list is ordered. */
export function SortMenu() {
  const sortMode = useStore((s) => s.sortMode)
  const setSortMode = useStore((s) => s.setSortMode)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside or Escape so the menu doesn't linger. The overlay lives in a
  // shadow root, so compare against the composed event path, not event.target.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !e.composedPath().includes(ref.current)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Sort issues"
        title="Sort issues"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid h-8 w-8 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-600 ${
          open ? 'bg-leaf-50 text-leaf-800' : 'text-bark-700/80 hover:bg-leaf-50 hover:text-leaf-800'
        }`}
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M4 6h12M6 10h8M8.5 14h3" strokeLinecap="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-leaf-100 bg-white py-1 shadow-panel"
          >
            {OPTIONS.map((opt) => {
              const active = opt.value === sortMode
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setSortMode(opt.value)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-leaf-50 focus-visible:bg-leaf-50 focus-visible:outline-none"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {active && (
                      <svg className="h-3.5 w-3.5 text-leaf-700" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className={`font-medium ${active ? 'text-leaf-800' : 'text-bark-900'}`}>
                      {opt.label}
                    </span>
                    <span className="text-[11px] text-bark-700/80">{opt.hint}</span>
                  </span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
