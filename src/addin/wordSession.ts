// One scan-and-fix session for the document open in Word.

import { OoxmlDoc, readStyleInfo, type XmlImpl } from '../lib/ooxml/ooxml'
import { analyzeDoc } from '../lib/analyzer/rules'
import { estimatePages } from '../lib/pageEstimate'
import type { Flag } from '../lib/analyzer/types'
import { parseFlatOpc } from './flatOpc'
import { alignParagraphs, planAction } from './plan'
import { readWord, runOps, selectParagraph } from './wordRun'

const impl = (): XmlImpl => ({ DOMParser: globalThis.DOMParser, XMLSerializer: globalThis.XMLSerializer }) as unknown as XmlImpl
const signature = (f: Flag) => `${f.type}:${f.range.start}:${f.range.end}`

export class WordSession {
  flags: Flag[] = []
  pages = 0
  /** Set when edits are switched off for this document, with the reason. */
  blocked: string | null = null
  private doc!: OoxmlDoc
  private map: (number | null)[] = []

  async scan(): Promise<void> {
    const { xml, paras } = await readWord()
    const pkg = parseFlatOpc(xml, impl())
    const styles = pkg.stylesXml ? readStyleInfo(pkg.stylesXml, impl()) : undefined
    this.doc = new OoxmlDoc(pkg.documentXml, impl(), { title: 'Document', styles })
    const aligned = alignParagraphs(this.doc.model, this.doc.topLevel(), paras)
    this.map = aligned.ok ? aligned.wordIndex : []
    this.blocked = aligned.ok ? null : aligned.reason
    this.flags = analyzeDoc(this.doc.model)
    this.pages = estimatePages(this.doc.model).pages
  }

  /** Why this fix can't be applied from the add-in, or null when it can. */
  unsupported(flag: Flag): string | null {
    if (this.blocked) return `Editing is off for this document. ${this.blocked}`
    const plan = planAction(flag.action, this.doc.model, this.map)
    return plan.ok ? null : plan.reason
  }

  get applicableCount(): number {
    return this.flags.filter((f) => !f.reviewFirst && this.unsupported(f) === null).length
  }

  async apply(flag: Flag): Promise<void> {
    if (this.blocked) return
    const plan = planAction(flag.action, this.doc.model, this.map)
    if (!plan.ok) return
    await runOps(plan.ops)
    await this.scan()
  }

  /** Apply every fix that can be done exactly, trying each issue once. */
  async applyAll(): Promise<number> {
    const tried = new Set<string>()
    let applied = 0
    for (let guard = 0; guard < 50; guard++) {
      const next = this.flags.find((f) => !f.reviewFirst && !tried.has(signature(f)) && this.unsupported(f) === null)
      if (!next) break
      tried.add(signature(next))
      await this.apply(next)
      applied++
    }
    return applied
  }

  async show(flag: Flag): Promise<void> {
    const m = this.doc.model
    const k = m.paragraphs.findIndex((p) => p.start! <= flag.range.start && flag.range.start <= p.end!)
    const at = this.map[k]
    if (at != null) await selectParagraph(at)
  }
}
