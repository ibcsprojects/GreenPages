// Fixes a Word (.docx) file entirely in the browser: unzip it, run the same checks and fixes
// as the Google Docs extension on its document XML, and zip a new copy. The original file
// is never modified, and nothing leaves the computer.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { OoxmlBackend, OoxmlDoc, readStyleInfo, type XmlImpl } from '../lib/ooxml/ooxml'
import { analyzeDoc } from '../lib/analyzer/rules'
import { applyAllFixes } from '../lib/applyAll'
import { estimatePages } from '../lib/pageEstimate'
import type { Flag } from '../lib/analyzer/types'

export const MAX_BYTES = 50 * 1024 * 1024
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** An error whose message is safe to show to the user. */
export class DocxError extends Error {}

function browserXml(): XmlImpl {
  return { DOMParser: globalThis.DOMParser, XMLSerializer: globalThis.XMLSerializer } as unknown as XmlImpl
}

export class DocxSession {
  readonly pagesBefore: number
  private applied = 0
  private cachedFlags: Flag[]

  private constructor(
    readonly name: string,
    private readonly files: Record<string, Uint8Array>,
    private readonly mainPart: string,
    private readonly docx: OoxmlDoc,
  ) {
    this.cachedFlags = analyzeDoc(docx.model)
    this.pagesBefore = estimatePages(docx.model).pages
  }

  static open(bytes: Uint8Array, name: string, impl: XmlImpl = browserXml()): DocxSession {
    if (bytes.length > MAX_BYTES) throw new DocxError('That file is over 50 MB, which is too large to check here.')
    let files: Record<string, Uint8Array>
    try {
      files = unzipSync(bytes)
    } catch {
      throw new DocxError(
        'This is not a Word .docx file, or it is password-protected. Open it in Word, remove the password, and save it as .docx.',
      )
    }
    const mainPart = findMainPart(files, impl)
    if (!files[mainPart]) throw new DocxError('This file has no document body, so there is nothing to check.')
    const stylesPath = mainPart.replace(/[^/]+$/, 'styles.xml')
    const styles = files[stylesPath] ? readStyleInfo(strFromU8(files[stylesPath]), impl) : undefined
    let docx: OoxmlDoc
    try {
      docx = new OoxmlDoc(strFromU8(files[mainPart]), impl, { title: name.replace(/\.docx$/i, ''), styles })
    } catch {
      throw new DocxError('Could not read this document. It may be damaged.')
    }
    return new DocxSession(name, files, mainPart, docx)
  }

  get flags(): Flag[] {
    return this.cachedFlags
  }
  get pages(): number {
    return estimatePages(this.docx.model).pages
  }
  get appliedCount(): number {
    return this.applied
  }

  async apply(flagId: string): Promise<void> {
    const flag = this.cachedFlags.find((f) => f.id === flagId)
    if (!flag) return
    await new OoxmlBackend(this.docx).apply(this.docx.model, flag.action)
    this.applied += 1
    this.cachedFlags = analyzeDoc(this.docx.model)
  }

  async applyAll(): Promise<void> {
    const backend = new OoxmlBackend(this.docx)
    const result = await applyAllFixes(this.docx.model, async (m) => analyzeDoc(m), (m, a) => backend.apply(m, a))
    this.applied += result.applied
    this.cachedFlags = result.flags
  }

  /** A new .docx with the fixes applied. Every other part of the file is copied unchanged. */
  export(): Uint8Array {
    let xml = this.docx.serialize()
    if (!xml.startsWith('<?xml')) xml = XML_DECLARATION + xml
    return zipSync({ ...this.files, [this.mainPart]: strToU8(xml) }, { level: 6 })
  }
}

/** The package relationships name the main document part; it is usually word/document.xml. */
function findMainPart(files: Record<string, Uint8Array>, impl: XmlImpl): string {
  const rels = files['_rels/.rels']
  if (rels) {
    const doc = new impl.DOMParser().parseFromString(strFromU8(rels), 'application/xml')
    const all = doc.getElementsByTagName('Relationship')
    for (let i = 0; i < all.length; i++) {
      const rel = all[i]
      if ((rel.getAttribute('Type') ?? '').endsWith('/officeDocument')) {
        return (rel.getAttribute('Target') ?? 'word/document.xml').replace(/^\//, '')
      }
    }
  }
  return 'word/document.xml'
}
