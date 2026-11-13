import { describe, it, expect } from 'vitest'
import { tabPosition, TAB_H, TAB_W, type Box } from './tabPosition'

// A 1200x700 editor and Letter-ish pages, 816 wide and 1056 tall.
const view: Box = { left: 0, top: 100, right: 1200, bottom: 800 }
const page = (top: number): Box => ({ left: 192, top, right: 1008, bottom: top + 1056 })

describe('tabPosition', () => {
  it('sits just outside the right edge of the page the reader is on', () => {
    expect(tabPosition(view, [page(120)]).x).toBe(1008 + 6)
  })

  it('stays inside the view however far the page has scrolled', () => {
    for (const top of [-2000, -900, -100, 120, 500, 790]) {
      const { y } = tabPosition(view, [page(top)])
      expect(y).toBeGreaterThanOrEqual(view.top)
      expect(y + TAB_H).toBeLessThanOrEqual(view.bottom)
    }
  })

  it('follows the reader onto the next page', () => {
    // Page 2 is wider (a landscape section). Its edge is further right than page 1's.
    const page1: Box = { left: 192, top: -900, right: 1008, bottom: 156 }
    const page2: Box = { left: 92, top: 176, right: 1108, bottom: 1232 }
    // The middle of the view (450) is on page 2, so the tab sits on page 2's edge.
    expect(tabPosition(view, [page1, page2]).x).toBe(1108 + 6)
    // Scroll back so the middle of the view is on page 1: the tab returns to page 1's edge.
    const up1: Box = { ...page1, top: 100, bottom: 1156 }
    const up2: Box = { ...page2, top: 1176, bottom: 2232 }
    expect(tabPosition(view, [up1, up2]).x).toBe(1008 + 6)
  })

  it('picks the nearest page when the middle of the view falls in the gap between pages', () => {
    const above: Box = { left: 192, top: -700, right: 1008, bottom: 440 } // 10px above the middle
    const below: Box = { left: 92, top: 480, right: 1108, bottom: 1536 } // 30px below the middle
    expect(tabPosition(view, [above, below]).x).toBe(1008 + 6)
  })

  it('keeps clear of the scrollbar when the page runs to the edge of the view', () => {
    const zoomed: Box = { left: -300, top: 120, right: 1500, bottom: 1176 }
    expect(tabPosition(view, [zoomed]).x).toBe(view.right - TAB_W - 18)
  })

  it('falls back to the right side of the view when there are no pages', () => {
    const { x, y } = tabPosition(view, [])
    expect(x).toBe(view.right - TAB_W - 18)
    expect(y).toBe(view.top + 96)
  })

  it('ignores page boxes too small to be a page', () => {
    const tiny: Box = { left: 10, top: 10, right: 20, bottom: 20 }
    expect(tabPosition(view, [tiny, page(120)]).x).toBe(1008 + 6)
  })
})
