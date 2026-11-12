// Word's body.getOoxml() returns a "flat OPC" package: one XML file holding every part of a
// .docx. This pulls out the two parts Sparepage needs.

import type { XmlImpl } from '../lib/ooxml/ooxml'

const PKG = 'http://schemas.microsoft.com/office/2006/xmlPackage'

export interface FlatPackage {
  documentXml: string
  stylesXml?: string
}

export function parseFlatOpc(xml: string, impl: XmlImpl): FlatPackage {
  const dom = new impl.DOMParser().parseFromString(xml, 'application/xml')
  const out = new impl.XMLSerializer()
  const parts = dom.getElementsByTagNameNS(PKG, 'part')
  const find = (name: string): string | undefined => {
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].getAttributeNS(PKG, 'name') !== name) continue
      for (let n = parts[i].firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue
        for (let c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) return out.serializeToString(c)
      }
    }
    return undefined
  }
  const documentXml = find('/word/document.xml')
  if (!documentXml) throw new Error('Word did not return a document body.')
  return { documentXml, stylesXml: find('/word/styles.xml') }
}
