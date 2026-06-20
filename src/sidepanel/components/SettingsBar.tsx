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
            Paper size
            <select
              value={settings.paperSize}
              onChange={(e) => update({ paperSize: e.target.value as 'Letter' | 'A4' })}
              className="rounded border border-leaf-200 px-1.5 py-0.5"
            >
              <option>Letter</option>
              <option>A4</option>
            </select>
          </label>
          <label className="flex items-center justify-between">
            Double-sided reminder
            <input
              type="checkbox"
              checked={settings.duplexReminder}
              onChange={(e) => update({ duplexReminder: e.target.checked })}
              className="accent-leaf-600"
            />
          </label>
          <label className="flex items-center justify-between">
            Use AI backend
            <input
              type="checkbox"
              checked={settings.useAI}
              onChange={(e) => update({ useAI: e.target.checked })}
              className="accent-leaf-600"
            />
          </label>
          {settings.useAI && (
            <input
              type="url"
              placeholder="https://your-app.vercel.app"
              value={settings.backendUrl}
              onChange={(e) => update({ backendUrl: e.target.value })}
              className="w-full rounded border border-leaf-200 px-1.5 py-1"
            />
          )}
        </div>
      )}
    </div>
  )
}
