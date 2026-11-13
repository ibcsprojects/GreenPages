// Where the SparePage tab sits: a small piece attached to the right edge of the document
// page the reader is on. It stays inside the view as they scroll, and moves to the next page's
// edge when the next page takes over. Pure geometry, so it can be tested without Google Docs.

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export const TAB_W = 36
export const TAB_H = 76
/** Space between the page edge and the tab. */
const GAP = 6
/** Keep the tab clear of the editor's scrollbar. */
const SCROLLBAR = 18
/** How far below the top of the view the tab rests, clear of Docs' ruler. */
const REST_Y = 56
const EDGE = 16

/**
 * The top-left corner for the tab, in viewport pixels.
 * `view` is the editor's visible area and `pages` are the page boxes Docs lays out (any
 * order). With no pages found, the tab sits against the right side of the view instead.
 */
export function tabPosition(view: Box, pages: Box[]): { x: number; y: number } {
  const mid = (view.top + view.bottom) / 2
  const page = currentPage(mid, pages)

  const wanted = page ? page.right + GAP : view.right - TAB_W - SCROLLBAR
  // A page wider than the view (zoomed in) puts its edge off screen: sit on the scrollbar side.
  const x = Math.max(view.left, Math.min(wanted, view.right - TAB_W - SCROLLBAR))

  let y = view.top + REST_Y
  if (page) {
    // Stay on this page: not above its top, not below its bottom.
    y = Math.max(y, page.top + EDGE)
    y = Math.min(y, page.bottom - TAB_H - EDGE)
  }
  y = Math.max(view.top + EDGE, Math.min(y, view.bottom - TAB_H - EDGE))
  return { x: Math.round(x), y: Math.round(y) }
}

/** The panel's widest size, and the narrowest it shrinks to. */
export const PANEL_W = 300
export const PANEL_MIN_W = 248
/** Space kept between the panel and the editor's scrollbar. */
export const PANEL_EDGE = 24

/**
 * How wide the panel can be and still sit in the empty gutter beside the page, so it doesn't
 * cover the document. It is at most PANEL_W, and no narrower than PANEL_MIN_W: in a window too
 * narrow for that, it overlaps the page by the least it can.
 */
export function panelWidth(view: Box, pages: Box[]): number {
  const page = currentPage((view.top + view.bottom) / 2, pages)
  if (!page) return PANEL_W
  const gutter = view.right - PANEL_EDGE - (page.right + GAP)
  return Math.max(PANEL_MIN_W, Math.min(PANEL_W, Math.round(gutter)))
}

/** The page across the middle of the view, or failing that the one closest to it. */
function currentPage(mid: number, pages: Box[]): Box | null {
  const real = pages.filter((p) => p.right - p.left > 100 && p.bottom - p.top > 100)
  if (real.length === 0) return null
  const covering = real.find((p) => p.top <= mid && mid <= p.bottom)
  if (covering) return covering
  const gap = (p: Box) => (mid < p.top ? p.top - mid : mid - p.bottom)
  return real.reduce((a, b) => (gap(b) < gap(a) ? b : a))
}
