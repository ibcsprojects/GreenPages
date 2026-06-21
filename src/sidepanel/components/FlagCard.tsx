// The shared flag card — used both in the summary list (Mode 3) and, conceptually, as
// the anchored card a user would see on clicking a flag (Mode 2). One component, two homes.
//
// When several flags point at the same snippet (e.g. oversized font that is also
// highlighted, or a wordy paragraph that is also too large) they are rendered together by
// FlagGroupCard so the user sees one card per place in the document.

import { useState } from 'react'
import type { Flag, Severity } from '../../lib/analyzer/types'
import { useStore } from '../state/store'
import { FLAG_META, SEVERITY_DOT } from './flagMeta'

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 }

/** The category chip (icon + label) shown for each issue. */
function FlagChip({ flag }: { flag: Flag }) {
  const meta = FLAG_META[flag.type]
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${meta.accent}`}>
      {meta.icon} {meta.label}
    </span>
  )
}

/** Short "~N saved / ink↓" summary for one flag's impact. */
function impactLabel(flag: Flag): string {
  const paper = flag.impact.paper
  const ink = flag.impact.ink
  const parts: string[] = []
  if (paper > 0.001) parts.push(`~${formatPages(paper)} saved`)
  if (ink > 0.001) parts.push('ink↓')
  return parts.join(' · ')
}

/**
 * The interactive body of a single issue: title, explanation, before→after preview and
 * the apply / dismiss / edit controls. Reused by both the single and grouped cards.
 */
function FlagIssueBody({ flag }: { flag: Flag }) {
  const apply = useStore((s) => s.apply)
  const dismiss = useStore((s) => s.dismiss)
  const busy = useStore((s) => s.busy[flag.id])

  // Verbose flags expose an editable AI suggestion before applying.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(flag.editableSuggestion ?? '')

  return (
    <>
      <h3 className="text-sm font-semibold text-bark-900">{flag.title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-bark-700/80">{flag.explanation}</p>

      <div className="mt-2 space-y-1 rounded-lg bg-leaf-50 p-2 text-xs">
        <div className="flex gap-1.5">
          <span className="shrink-0 font-medium text-rose-600">Now</span>
          <span className="text-bark-700/80 line-through decoration-rose-300">{flag.before}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="shrink-0 font-medium text-leaf-700">Eco</span>
          {editing ? (
            <textarea
              className="w-full rounded border border-leaf-200 p-1 text-xs"
              rows={4}
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <span className="text-bark-900">{flag.after}</span>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => apply(flag.id, editing ? draft : undefined)}
          disabled={busy}
          className="rounded-lg bg-leaf-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-leaf-700 disabled:opacity-50"
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
        <button
          onClick={() => dismiss(flag.id)}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-bark-700/70 transition hover:bg-leaf-100"
        >
          Dismiss
        </button>
        {flag.editableSuggestion !== undefined && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="ml-auto rounded-lg px-2 py-1.5 text-xs font-medium text-leaf-700 transition hover:bg-leaf-100"
          >
            {editing ? 'Done editing' : 'Edit suggestion'}
          </button>
        )}
      </div>
    </>
  )
}

/** A single flag on its own snippet. */
export function FlagCard({ flag }: { flag: Flag }) {
  const reveal = useStore((s) => s.reveal)
  const impact = impactLabel(flag)

  return (
    <div
      onClick={() => reveal(flag.id)}
      title="Scroll the document to this paragraph"
      className="cursor-pointer rounded-xl border border-leaf-100 bg-white p-3 shadow-sm transition hover:border-leaf-300 hover:shadow-md"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[flag.severity]}`} aria-hidden />
        <FlagChip flag={flag} />
        {impact && <span className="ml-auto text-[11px] text-bark-700/60">{impact}</span>}
      </div>
      <FlagIssueBody flag={flag} />
    </div>
  )
}

/** Several flags that share one snippet, stacked under a single card. */
export function FlagGroupCard({ flags }: { flags: Flag[] }) {
  const reveal = useStore((s) => s.reveal)

  const topSeverity = flags.reduce<Severity>(
    (acc, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc),
    'low',
  )
  const paper = flags.reduce((s, f) => s + f.impact.paper, 0)
  const ink = flags.reduce((s, f) => s + f.impact.ink, 0)
  const totalParts: string[] = []
  if (paper > 0.001) totalParts.push(`~${formatPages(paper)} saved`)
  if (ink > 0.001) totalParts.push('ink↓')

  return (
    <div
      onClick={() => reveal(flags[0].id)}
      title="Scroll the document to this paragraph"
      className="cursor-pointer rounded-xl border border-leaf-100 bg-white p-3 shadow-sm transition hover:border-leaf-300 hover:shadow-md"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[topSeverity]}`} aria-hidden />
        <span className="text-xs font-semibold text-bark-900">
          {flags.length} issues on this snippet
        </span>
        {totalParts.length > 0 && (
          <span className="ml-auto text-[11px] text-bark-700/60">{totalParts.join(' · ')}</span>
        )}
      </div>

      <div className="space-y-2">
        {flags.map((flag) => (
          <div key={flag.id} className="rounded-lg border border-leaf-100 bg-leaf-50/40 p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <FlagChip flag={flag} />
              {impactLabel(flag) && (
                <span className="ml-auto text-[11px] text-bark-700/60">{impactLabel(flag)}</span>
              )}
            </div>
            <FlagIssueBody flag={flag} />
          </div>
        ))}
      </div>
    </div>
  )
}

function formatPages(p: number): string {
  if (p >= 1) return `${p.toFixed(1)} pages`
  return `${Math.round(p * 100)}% page`
}
