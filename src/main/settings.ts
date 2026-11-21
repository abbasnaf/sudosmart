import { execute, queryOne } from './db'
import type { AppSettings } from '@shared/types'

const DEFAULTS: AppSettings = {
  theme: 'dark',
  launchOnStartup: false,
  minimizeToTray: true,
  globalShortcutsEnabled: true,
  notificationsEnabled: true,
  shortcuts: {
    toggleLight: 'CommandOrControl+Alt+L',
    openDashboard: 'CommandOrControl+Alt+D',
    activateGamingScene: 'CommandOrControl+Alt+G'
  },
  discoveryInterfaces: [],
  discoveryTimeoutMs: 3000,
  selectedLightId: null
}

const KEY = 'app_settings'

export async function getSettings(): Promise<AppSettings> {
  const row = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [KEY])
  if (!row) return { ...DEFAULTS, shortcuts: { ...DEFAULTS.shortcuts } }
  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>
    return {
      ...DEFAULTS,
      ...parsed,
      shortcuts: { ...DEFAULTS.shortcuts, ...(parsed.shortcuts ?? {}) }
    }
  } catch {
    return { ...DEFAULTS, shortcuts: { ...DEFAULTS.shortcuts } }
  }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next = {
    ...current,
    ...patch,
    shortcuts: { ...current.shortcuts, ...(patch.shortcuts ?? {}) }
  }
  await execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [KEY, JSON.stringify(next)]
  )
  return next
}
