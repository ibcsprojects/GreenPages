import { useStore } from '../store'
import { totalImpact } from '../../lib/analyzer/rules'
import { progressScore } from '../../lib/progress'

/** Summary strip under the panel header: score, issue count, page count, total saving. */
export function EcoScore() {
  const flags = useStore((s) => s.flags)
  const peak = useStore((s) => s.peakFlags)
  const pages = useStore((s) => s.pages)
  const pagesExact = useStore((s) => s.pagesExact)
  const loading = useStore((s) => s.loading)
  const doc = useStore((s) => s.doc)

  // Don't flash a misleading "perfect" score before the first scan finishes.
  if (!doc || (loading && flags.length === 0)) return null

  const impact = totalImpact(flags)
  // Progress: the share of the issues found so far that are fixed, so every fix moves it.
  const score = progressScore(flags.length, peak)
  const fixed = Math.max(0, peak - flags.length)
  const tone = score >= 80 ? 'text-leaf-600' : score >= 40 ? 'text-amber-500' : 'text-clay-600'
  const saved = impact.paper >= 0.05

  return (
    <div className="flex items-center gap-3 border-b border-leaf-100 bg-white px-3.5 py-3">
      <div
        role="img"
        aria-label={`${score} percent of the issues found are fixed`}
        className={`relative grid h-12 w-12 shrink-0 place-items-center ${tone}`}
      >
        <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5f5ea" strokeWidth="4" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 97.4} 97.4`}
          />
        </svg>
        <span className="absolute text-[13px] font-bold text-bark-900">{score}</span>
      </div>
      <div className="min-w-0 text-[12px] leading-snug">
        <div className="font-semibold text-bark-900">
          {flags.length === 0
            ? 'Ready to print'
            : fixed > 0
              ? `${flags.length} left, ${fixed} fixed`
              : `${flags.length} issue${flags.length === 1 ? '' : 's'} found`}
        </div>
        <div className="text-bark-700/80">
          {pagesExact ? (
            <>
              {pages} page{pages === 1 ? '' : 's'}
            </>
          ) : (
            <>
              About {pages} page{pages === 1 ? '' : 's'}{' '}
              <span className="rounded bg-leaf-50 px-1 py-px text-[10px] font-medium text-bark-700/80">
                estimate
              </span>
            </>
          )}
        </div>
        {saved && (
          <div className="font-medium text-leaf-700">
            Fixing all saves about {formatPages(impact.paper)}
            {impact.ink > 0.1 ? ' and ink' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function formatPages(p: number): string {
  if (p >= 1) return `${p.toFixed(1)} pages`
  return `${Math.round(p * 100)}% of a page`
}
