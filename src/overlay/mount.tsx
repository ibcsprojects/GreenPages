// Mounts the overlay into a Shadow DOM host appended to the page. Used by the Google Docs
// content script and by the demo page, so both show the exact same UI.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import css from './overlay.css?inline'
import { Overlay } from './Overlay'
import { useStore } from './store'

export interface OverlayController {
  open: () => void
  toggle: () => void
}

export function mountOverlay(anchor?: () => DOMRect | null): OverlayController {
  if (!document.getElementById('greenpages-overlay')) {
    const host = document.createElement('div')
    host.id = 'greenpages-overlay'
    document.documentElement.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = css
    shadow.appendChild(style)
    const mountPoint = document.createElement('div')
    shadow.appendChild(mountPoint)
    createRoot(mountPoint).render(
      <StrictMode>
        <Overlay anchor={anchor} />
      </StrictMode>,
    )
  }
  return {
    open: () => useStore.getState().setOpen(true),
    toggle: () => useStore.getState().toggle(),
  }
}
