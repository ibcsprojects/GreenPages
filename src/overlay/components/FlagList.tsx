import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { FlagCard, FlagGroupCard } from './FlagCard'
import { groupFlags } from './groupFlags'
import { logoUrl } from '../logo'

/** Total fractional pages a group of flags would save, used to rank by biggest win. */
function groupPaper(group: { impact: { paper: number } }[]): number {
  return group.reduce((sum, f) => sum + f.impact.paper, 0)
}

export function FlagList() {
  const flags = useStore((s) => s.flags)
  const loading = useStore((s) => s.loading)
  const sortMode = useStore((s) => s.sortMode)
  const doc = useStore((s) => s.doc)

  // Only one card is open at a time (accordion). Keyed by the group's lead flag id.
  const [openId, setOpenId] = useState<string | null>(null)

  if (loading && flags.length === 0) {
    return (
      <div className="grid place-items-center px-6 py-10 text-center">
        <div className="relative grid h-12 w-12 place-items-center">
          <motion.span
            className="absolute h-12 w-12 rounded-full border-2 border-leaf-100 border-t-leaf-600"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}
            aria-hidden
          />
          <img src={logoUrl()} alt="" className="h-5 w-5" />
        </div>
        <p className="mt-3 text-[13px] font-medium text-bark-900">Checking this document</p>
        <p className="mt-0.5 text-[12px] text-bark-700/80">Looking for ways to save pages and ink.</p>
      </div>
    )
  }

  if (!doc) return null

  if (flags.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[13px] font-semibold text-leaf-800">No print waste found</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-[12px] text-bark-700/80">
          Every issue is fixed or dismissed. This document is ready to print.
        </p>
      </div>
    )
  }

  // Cluster overlapping flags first (groupFlags relies on document order), then reorder the
  // finished groups per sortMode.
  const ordered = [...flags].sort((a, b) => a.range.start - b.range.start)
  const groups = groupFlags(ordered)

  if (sortMode === 'savings') {
    // Biggest page saving first; ties keep document order (stable sort).
    groups.sort((a, b) => groupPaper(b) - groupPaper(a))
  } else {
    // Document order, but the margins recommendation always leads.
    groups.sort((a, b) => {
      const aMargins = a.some((f) => f.type === 'wideMargins')
      const bMargins = b.some((f) => f.type === 'wideMargins')
      if (aMargins && !bMargins) return -1
      if (bMargins && !aMargins) return 1
      return a[0].range.start - b[0].range.start
    })
  }

  return (
    <ul className="space-y-2 p-3">
      {groups.map((group) => {
        const id = group[0].id
        const expanded = openId === id
        const onToggle = (open: boolean) => setOpenId(open ? id : null)
        return (
          <li key={id}>
            {group.length === 1 ? (
              <FlagCard flag={group[0]} expanded={expanded} onToggle={onToggle} />
            ) : (
              <FlagGroupCard flags={group} expanded={expanded} onToggle={onToggle} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
