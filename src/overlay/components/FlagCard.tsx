// The flag card shown in the overlay's issue list. When several flags point at the same
// snippet (e.g. oversized font that is also highlighted) they are rendered together by
// FlagGroupCard, so the user sees one card per place in the document.

import { useState } from 'react'
import type { Flag, Severity } from '../../lib/analyzer/types'
import { useStore } from '../store'
import { FLAG_META, SEVERITY_DOT } from './flagMeta'

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 }

/** The category chip shown for each issue. */
function FlagChip({ flag }: { flag: Flag }) {
  const meta = FLAG_META[flag.type]
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${meta.accent}`}>
      {meta.label}
    </span>
  )
}

/** A chevron that flips when its card is open. Deliberately not animated: opening cards
 *  is a high-frequency action, and motion there is friction, not polish. */
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-bark-700/40 ${expanded ? 'rotate-180' : ''}`}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** "saves N" summary for one flag's impact, shown when the card is open. */
function impactLabel(flag: Flag): string {
  const parts: string[] = []
  if (flag.impact.paper > 0.001) parts.push(`saves ${formatPages(flag.impact.paper)}`)
  if (flag.impact.ink > 0.001) parts.push('less ink')
  return parts.join(', ')
}

/** Compact version for the collapsed header, so the title keeps the room. */
function shortImpact(paper: number, ink: number): string {
  if (paper > 0.001) return paper >= 1 ? `${paper.toFixed(1)} pg` : `${Math.max(1, Math.round(paper * 100))}% pg`
  return ink > 0.001 ? 'ink' : ''
}

/** Expanded card content. Appears instantly, for the same reason as the chevron. */
function Reveal({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}

/**
 * The interactive body of one issue: explanation, before → after preview, the rewrite's
 * individual changes, and the apply / dismiss / edit controls.
 */
function FlagIssueBody({ flag, showTitle = false }: { flag: Flag; showTitle?: boolean }) {
  const apply = useStore((s) => s.apply)
  const dismiss = useStore((s) => s.dismiss)
  const reveal = useStore((s) => s.reveal)
  const busy = useStore((s) => s.busy[flag.id])

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(flag.editableSuggestion ?? '')
  const rewrites = flag.rewrites ?? []

  return (
    <>
      {showTitle && <h3 className="text-[13px] font-semibold text-bark-900">{flag.title}</h3>}
      <p className="mt-1 text-[12px] leading-relaxed text-bark-700/80">{flag.explanation}</p>

      <dl className="mt-2 space-y-1 rounded-lg bg-leaf-50/70 p-2 text-[12px]">
        <div className="flex gap-2">
          <dt className="w-9 shrink-0 font-medium text-clay-700">Now</dt>
          <dd className="text-bark-700/80 line-through decoration-clay-600/40">{flag.before}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-9 shrink-0 font-medium text-leaf-700">Fix</dt>
          <dd className="min-w-0 flex-1 text-bark-900">
            {editing ? (
              <textarea
                aria-label="Edit the suggested wording"
                className="w-full rounded-md border border-leaf-200 bg-white p-1.5 text-[12px] focus:outline focus:outline-2 focus:outline-leaf-600"
                rows={5}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              flag.after
            )}
          </dd>
        </div>
      </dl>

      {rewrites.length > 0 && !editing && (
        <div className="mt-2">
          <div className="text-[11px] font-medium text-bark-700/80">
            {rewrites.length} change{rewrites.length === 1 ? '' : 's'}
          </div>
          <ul className="mt-1 flex flex-wrap gap-1">
            {rewrites.slice(0, 8).map((r, i) => (
              <li
                key={i}
                className="rounded-md border border-leaf-100 bg-white px-1.5 py-0.5 text-[11px] text-bark-700"
              >
                <span className="text-bark-700/80 line-through">{r.from}</span>
                {r.to ? (
                  <span className="text-leaf-800"> {r.to}</span>
                ) : (
                  <span className="text-bark-700/80"> (cut)</span>
                )}
              </li>
            ))}
            {rewrites.length > 8 && (
              <li className="px-1 py-0.5 text-[11px] text-bark-700/80">
                and {rewrites.length - 8} more
              </li>
            )}
          </ul>
        </div>
      )}
      {flag.reviewFirst && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-bark-800">
          This one leaves out whole sentences, so it is not part of Apply all. Read it, edit it if
          something important is missing, then apply it.
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => apply(flag.id, editing ? draft : undefined)}
          disabled={busy}
          className="rounded-lg bg-leaf-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-leaf-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf-700 disabled:opacity-50"
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
        <button
          type="button"
          onClick={() => dismiss(flag.id)}
          disabled={busy}
          className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-bark-700/80 hover:bg-leaf-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-600"
        >
          Dismiss
        </button>
        {flag.editableSuggestion !== undefined && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-leaf-800 hover:bg-leaf-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-600"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
        <button
          type="button"
          onClick={() => reveal(flag.id)}
          className="ml-auto rounded-lg px-2 py-1.5 text-[12px] font-medium text-bark-700/80 hover:bg-leaf-50 hover:text-leaf-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-600"
        >
          Show
        </button>
      </div>
    </>
  )
}

const CARD =
  'overflow-hidden rounded-xl border border-leaf-100 bg-white shadow-card hover:border-leaf-200'
const HEAD =
  'flex w-full items-center gap-2 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-leaf-600'

/** A single flag on its own snippet: compact by default, expands on click. */
export function FlagCard({
  flag,
  expanded,
  onToggle,
}: {
  flag: Flag
  expanded: boolean
  onToggle: (open: boolean) => void
}) {
  const reveal = useStore((s) => s.reveal)
  const impact = impactLabel(flag)

  // Opening a card also scrolls the document to it, so the user sees it in context.
  const toggle = () => {
    const next = !expanded
    onToggle(next)
    if (next) void reveal(flag.id)
  }

  return (
    <div className={CARD}>
      <button type="button" onClick={toggle} aria-expanded={expanded} className={HEAD}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[flag.severity]}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-bark-900">
          {flag.title}
        </span>
        {!expanded && impact && (
          <span className="shrink-0 text-[11px] tabular-nums text-bark-700/80" title={impact}>
            {shortImpact(flag.impact.paper, flag.impact.ink)}
          </span>
        )}
        <Chevron expanded={expanded} />
      </button>
      {expanded && (
        <Reveal>
          <div className="border-t border-leaf-100 px-3 pb-3 pt-2.5">
            <div className="flex items-center gap-2">
              <FlagChip flag={flag} />
              {impact && <span className="ml-auto text-[11px] text-bark-700/80">{impact}</span>}
            </div>
            <FlagIssueBody flag={flag} />
          </div>
        </Reveal>
      )}
    </div>
  )
}

/** Several flags that share one snippet, stacked under a single card. */
export function FlagGroupCard({
  flags,
  expanded,
  onToggle,
}: {
  flags: Flag[]
  expanded: boolean
  onToggle: (open: boolean) => void
}) {
  const reveal = useStore((s) => s.reveal)
  const topSeverity = flags.reduce<Severity>(
    (acc, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc),
    'low',
  )
  const paper = flags.reduce((s, f) => s + f.impact.paper, 0)

  const toggle = () => {
    const next = !expanded
    onToggle(next)
    if (next) void reveal(flags[0].id)
  }

  return (
    <div className={CARD}>
      <button type="button" onClick={toggle} aria-expanded={expanded} className={HEAD}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[topSeverity]}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-bark-900">
          {flags.length} issues in one spot
        </span>
        {!expanded && paper > 0.001 && (
          <span className="shrink-0 text-[11px] tabular-nums text-bark-700/80" title={`saves ${formatPages(paper)}`}>
            {shortImpact(paper, 0)}
          </span>
        )}
        <Chevron expanded={expanded} />
      </button>
      {expanded && (
        <Reveal>
          <div className="space-y-2 border-t border-leaf-100 p-3">
            {flags.map((flag) => (
              <div key={flag.id} className="rounded-lg border border-leaf-100 bg-leaf-50/40 p-2.5">
                <div className="mb-1 flex items-center gap-2">
                  <FlagChip flag={flag} />
                  {impactLabel(flag) && (
                    <span className="ml-auto text-[11px] text-bark-700/80">{impactLabel(flag)}</span>
                  )}
                </div>
                <FlagIssueBody flag={flag} showTitle />
              </div>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  )
}

function formatPages(p: number): string {
  if (p >= 1) return `${p.toFixed(1)} pages`
  return `${Math.max(1, Math.round(p * 100))}% of a page`
}
