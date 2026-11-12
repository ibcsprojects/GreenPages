// The only file that calls Word's API. It reads the body as OOXML plus the paragraph list,
// and carries out the exact steps planAction produced. Everything else is plain logic.

import type { Op, WordPara } from './plan'

export async function readWord(): Promise<{ xml: string; paras: WordPara[] }> {
  return Word.run(async (context) => {
    const body = context.document.body
    const ooxml = body.getOoxml()
    const paragraphs = body.paragraphs
    paragraphs.load('items/text,items/tableNestingLevel')
    await context.sync()
    return {
      xml: ooxml.value,
      paras: paragraphs.items.map((p) => ({ text: p.text, nesting: p.tableNestingLevel })),
    }
  })
}

/** Select a paragraph, which also scrolls Word to it. */
export async function selectParagraph(at: number): Promise<void> {
  await Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs
    paragraphs.load('items')
    await context.sync()
    paragraphs.items[at]?.select('Select')
    await context.sync()
  })
}

export async function runOps(ops: Op[]): Promise<void> {
  if (ops.length === 0) return
  await Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs
    paragraphs.load('items')
    await context.sync()

    // Pictures need their current size before we can scale them.
    const pictureOps = ops.filter((o): o is Extract<Op, { op: 'scalePictures' }> => o.op === 'scalePictures')
    const pictures = pictureOps.map((o) => {
      const pics = paragraphs.items[o.at].inlinePictures
      pics.load('items/width,items/height')
      return pics
    })
    if (pictures.length) await context.sync()

    for (const op of ops) {
      const para = paragraphs.items[op.at]
      if (!para) continue
      switch (op.op) {
        case 'deleteParagraph':
          para.delete()
          break
        case 'setIndent':
          if (op.left) para.leftIndent = 0
          if (op.right) para.rightIndent = 0
          break
        case 'scalePictures': {
          const pics = pictures[pictureOps.indexOf(op)].items
          for (const [n, pic] of pics.entries()) {
            if (op.only != null && n !== op.only) continue
            const width = Math.round(pic.width * op.scale)
            const height = Math.round(pic.height * op.scale)
            pic.lockAspectRatio = true
            pic.width = width
            pic.height = height
          }
          break
        }
        case 'setFont':
          if (op.size != null) para.font.size = op.size
          if (op.clearHighlight) {
            para.font.highlightColor = null as unknown as string
            if (op.alt === 'underline') para.font.underline = 'Single'
            else para.font.italic = true
          }
          break
        case 'replaceText':
          para.insertText(op.text, 'Replace')
          break
      }
    }
    await context.sync()
  })
}
