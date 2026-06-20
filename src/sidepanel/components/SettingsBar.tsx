import { useState } from 'react'
import { useStore } from '../state/store'

export function SettingsBar() {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-leaf-100 bg-white/70 px-3 py-2 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center text-bark-700/70 hover:text-bark-900"
      >
        <span className="font-medium">Settings</span>
        <span className="ml-auto">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <label className="flex items-center justify-between">
            Double-sided reminder
            <input
              type="checkbox"
              checked={settings.duplexReminder}
              onChange={(e) => update({ duplexReminder: e.target.checked })}
              className="accent-leaf-600"
            />
          </label>
          <p className="rounded-lg bg-leaf-50 px-2 py-1.5 text-[11px] leading-relaxed text-leaf-800">
            ✨ AI is on. GreenPages reads your paragraphs and rewrites wordy ones to save paper —
            you’ll see those flagged in the list above.
          </p>
        </div>
      )}
    </div>
  )
}
