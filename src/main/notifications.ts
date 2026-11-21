import { Notification } from 'electron'
import { getSettings } from './settings'

export async function notify(title: string, body: string): Promise<void> {
  const settings = await getSettings()
  if (!settings.notificationsEnabled) return
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}
