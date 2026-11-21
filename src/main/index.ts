import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow, getMainWindow, setIsQuitting } from './window'
import { createTray } from './tray'
import { registerIpc } from './ipc'
import { registerShortcuts, unregisterShortcuts } from './shortcuts'
import { applyStartupSetting } from './startup'
import { integrationManager } from './integrations/manager'
import { closeDb } from './db'

// Allows an isolated profile for automated tests or portable installs.
const customUserData = process.env.SUDOSMART_USER_DATA
if (customUserData) {
  fs.mkdirSync(customUserData, { recursive: true })
  app.setPath('userData', customUserData)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.sudosmart.controlcentre')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpc()
    createMainWindow()
    createTray()
    await applyStartupSetting()
    await registerShortcuts()

    try {
      await integrationManager.init()
    } catch (error) {
      console.error('Integration manager failed to initialize:', error)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    // Keep running in tray on Windows; quitting is explicit.
    if (process.platform !== 'darwin') {
      // no-op: tray keeps app alive
    }
  })

  app.on('before-quit', () => {
    setIsQuitting(true)
    unregisterShortcuts()
  })

  app.on('will-quit', () => {
    void integrationManager.shutdown()
    closeDb()
  })
}
