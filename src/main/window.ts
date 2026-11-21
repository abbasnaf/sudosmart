import { BrowserWindow, app, shell } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

export function setIsQuitting(value: boolean): void {
  isQuitting = value
}

export function getIsQuitting(): boolean {
  return isQuitting
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow) return mainWindow

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0b1118',
    title: 'SudoSmart Control Centre',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    void getSettings().then((settings) => {
      if (settings.minimizeToTray && !isQuitting) {
        mainWindow?.hide()
      } else {
        isQuitting = true
        app.quit()
      }
    })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
