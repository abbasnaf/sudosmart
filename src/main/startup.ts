import { app } from 'electron'
import { getSettings } from './settings'

export async function applyStartupSetting(): Promise<void> {
  const settings = await getSettings()
  app.setLoginItemSettings({
    openAtLogin: settings.launchOnStartup,
    path: process.execPath
  })
}
