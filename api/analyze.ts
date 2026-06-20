// POST /api/analyze  { doc } -> { flags }
// Structural detection runs deterministically (reliable), then verbose-flag suggestions
// are upgraded with Gemini when a key is present. Same Flag[] shape as the local engine,
// so the side panel renders identically whether analysis is local or AI-assisted.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { DocModel } from '../src/lib/docModel.js'
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

  const flags = analyzeDoc(doc)

  // Upgrade verbose suggestions with Gemini (best-effort, capped to keep latency sane).
  if (hasGeminiKey()) {
    const verbose = flags.filter((f) => f.type === 'verbose').slice(0, 5)
    await Promise.all(
      verbose.map(async (f) => {
        const ai = await geminiGenerate(condensePrompt(f.editableSuggestion ?? f.after)).catch(
          () => null,
        )
        if (ai && f.action.kind === 'replaceText') {
          f.editableSuggestion = ai
          f.action.text = ai
          f.after = ai.length > 90 ? ai.slice(0, 89) + '…' : ai
        }
      }),
    )
  }

  return res.status(200).json({ flags })
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
