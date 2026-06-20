// Content script injected into Google Docs. Two jobs:
//  1. Install the print intercept (Layer 2).
//  2. Float a small "GreenPages" pill that opens the side panel (Mode 3).
//
// NOTE: we deliberately do not try to draw inline underlines over the document. Google
// Docs renders text to <canvas>, so per-word screen coordinates aren't available to an
// extension — that's why analysis + fixes live in the side panel. See docs/ARCHITECTURE.md.

import { sendMessage, ExtensionContextInvalidatedError } from '../lib/messaging'
import { installPrintIntercept } from './printIntercept'

installPrintIntercept()
mountPill()

function mountPill(): void {
  if (document.getElementById('greenpages-pill')) return
  const host = document.createElement('div')
  host.id = 'greenpages-pill'
  document.documentElement.appendChild(host)
  const root = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = `
    .pill {
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483646;
      display: flex; align-items: center; gap: 8px;
      background: #16a34a; color: #fff; border: 0; cursor: pointer;
      font-family: Inter, system-ui, sans-serif; font-weight: 600; font-size: 13px;
      padding: 10px 14px; border-radius: 999px;
      box-shadow: 0 8px 24px rgba(22,163,74,.35);
      transition: transform .12s ease, background .12s ease;
    }
    .pill:hover { transform: translateY(-1px); background: #15803d; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #bbf7d0; }
  `
  root.appendChild(style)

  const btn = document.createElement('button')
  btn.className = 'pill'
  btn.innerHTML = `<span class="dot"></span>🌿 GreenPages`
  btn.title = 'Open GreenPages eco-formatting panel'
  btn.addEventListener('click', () => {
    sendMessage({ type: 'OPEN_PANEL' }).catch((err) => {
      if (err instanceof ExtensionContextInvalidatedError) {
        btn.innerHTML = `<span class="dot"></span>↻ Reload page`
        btn.title = 'GreenPages was updated. Reload this tab to reconnect.'
      } else {
        console.error('[GreenPages] OPEN_PANEL failed', err)
      }
    })
  })
  root.appendChild(btn)
}
