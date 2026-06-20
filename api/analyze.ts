// POST /api/analyze  { doc } -> { flags }
// Structural detection runs deterministically (reliable), then verbose-flag suggestions
// are upgraded with Gemini when a key is present. Same Flag[] shape as the local engine,
// so the side panel renders identically whether analysis is local or AI-assisted.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { DocModel } from '../src/lib/docModel.js'
import type { Flag } from '../src/lib/analyzer/types.js'
import { analyzeDoc } from '../src/lib/analyzer/rules.js'
import { geminiGenerate, hasGeminiKey } from '../server/lib/gemini.js'
import { condensePrompt, setCors } from '../server/lib/prompt.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  // @vercel/node parses the JSON body for us; guard against a raw string just in case.
  const { doc } = parseBody<{ doc?: DocModel }>(req.body)
  if (!doc) return res.status(400).json({ error: 'missing doc' })

  const ai = hasGeminiKey()
  // With a key we cast a wider net for wordy paragraphs (long ones our phrase list
  // misses) and let Gemini do the actual rewriting below.
  let flags = analyzeDoc(doc, { aiRewrite: ai })

  if (ai) {
    // Source text for each flagged paragraph, used to detect rewrites that didn't help.
    const text = doc.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
    const verbose = flags.filter((f) => f.type === 'verbose').slice(0, 6)
    await Promise.all(
      verbose.map(async (f) => {
        if (f.action.kind !== 'replaceText') return
        const original = text.slice(f.range.start, f.range.end)
        const rewritten = await geminiGenerate(condensePrompt(original)).catch(() => null)
        if (rewritten && rewritten.length < original.length) {
          f.editableSuggestion = rewritten
          f.action.text = rewritten
          f.after = rewritten.length > 90 ? rewritten.slice(0, 89) + '…' : rewritten
        }
      }),
    )
    // Drop any wordy flag we couldn't actually shorten (no-op rewrite/fallback), so the
    // side panel never shows a "rewrite" that changes nothing.
    flags = flags.filter((f) => !isNoOpVerbose(f, text))
  }

  return res.status(200).json({ flags })
}

/** True for a verbose flag whose suggested replacement equals the original text. */
function isNoOpVerbose(f: Flag, fullText: string): boolean {
  if (f.type !== 'verbose' || f.action.kind !== 'replaceText') return false
  return f.action.text === fullText.slice(f.range.start, f.range.end)
}

function parseBody<T>(body: unknown): T {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}') as T
    } catch {
      return {} as T
    }
  }
  return (body ?? {}) as T
}
