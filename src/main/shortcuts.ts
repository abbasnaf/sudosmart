import { globalShortcut } from 'electron'
import { getMainWindow } from './window'
import { getSettings } from './settings'
import { integrationManager } from './integrations/manager'
import { IPC } from '@shared/types'

async function showDashboard(): Promise<void> {
  const win = getMainWindow()
  if (!win) return
  win.show()
  win.focus()
  win.webContents.send(IPC.NAVIGATE, '/')
}

async function toggleSelectedLight(): Promise<void> {
  const settings = await getSettings()
  let deviceId = settings.selectedLightId ?? null
  if (!deviceId) {
    const devices = await integrationManager.getDevices()
    deviceId =
      devices.find((d) => d.category === 'light' && d.state.online)?.id ??
      devices.find((d) => d.category === 'light')?.id ??
      null
  }
  if (!deviceId) return
  try {
    await integrationManager.execute(deviceId, { type: 'toggle' })
  } catch {
    // shortcut should not crash the app
  }
}

async function activateGamingScene(): Promise<void> {
  try {
    await integrationManager.activateSceneByName('gaming')
  } catch {
    // ignore
  }
}

export async function registerShortcuts(): Promise<void> {
  unregisterShortcuts()
  const settings = await getSettings()
  if (!settings.globalShortcutsEnabled) return

  const entries: Array<[string, () => void]> = [
    [settings.shortcuts.toggleLight, () => void toggleSelectedLight()],
    [settings.shortcuts.openDashboard, () => void showDashboard()],
    [settings.shortcuts.activateGamingScene, () => void activateGamingScene()],
    ['CommandOrControl+Shift+H', () => {
      const win = getMainWindow()
      if (!win) return
      if (win.isVisible()) win.hide()
      else {
        win.show()
        win.focus()
      }
    }]
  ]

  for (const [accelerator, handler] of entries) {
    if (!accelerator) continue
    try {
      if (!globalShortcut.isRegistered(accelerator)) globalShortcut.register(accelerator, handler)
    } catch {
      // invalid or conflicting accelerator
    }
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}
