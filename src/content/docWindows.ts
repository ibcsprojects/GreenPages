// Google Docs sends keystrokes through a hidden same-origin iframe, so a listener on the top
// window never sees what the user types or Ctrl/Cmd+P. This calls `cb` once for the top
// window and once for that iframe's window, including after Docs recreates the iframe.

export function watchDocWindows(cb: (win: Window) => void): void {
  const seen = new WeakSet<Window>()
  const visit = (win: Window | null | undefined) => {
    if (win && !seen.has(win)) {
      seen.add(win)
      cb(win)
    }
  }
  const scan = () => {
    visit(window)
    try {
      visit(document.querySelector<HTMLIFrameElement>('.docs-texteventtarget-iframe')?.contentWindow)
    } catch {
      // Not reachable yet.
    }
  }
  scan()
  window.setInterval(scan, 2000)
}

/** Press Ctrl/Cmd+key inside Docs, the way Docs' own shortcut handler expects it. */
export function pressShortcut(key: string): void {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  const opts: KeyboardEventInit = {
    key,
    code: `Key${key.toUpperCase()}`,
    keyCode: key.toUpperCase().charCodeAt(0),
    which: key.toUpperCase().charCodeAt(0),
    ctrlKey: !isMac,
    metaKey: isMac,
    bubbles: true,
    cancelable: true,
  }
  const iframe = document.querySelector<HTMLIFrameElement>('.docs-texteventtarget-iframe')
  const target = iframe?.contentDocument ?? document
  for (const type of ['keydown', 'keyup'] as const) target.dispatchEvent(new KeyboardEvent(type, opts))
}
