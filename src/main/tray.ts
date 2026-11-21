import { Menu, Tray, app, nativeImage } from 'electron'
import path from 'path'
import { getMainWindow, setIsQuitting } from './window'

let tray: Tray | null = null

// 1x1 transparent PNG used only if the bundled asset cannot be found.
const FALLBACK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function getTrayIcon() {
  const assetPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(__dirname, '../../resources/tray.png')
  const image = nativeImage.createFromPath(assetPath)
  if (!image.isEmpty()) return image
  return nativeImage.createFromDataURL(FALLBACK_PNG)
}

export function createTray(): Tray {
  if (tray) return tray
  tray = new Tray(getTrayIcon())
  tray.setToolTip('SudoSmart Control Centre')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show SudoSmart',
      click: () => {
        const win = getMainWindow()
        if (!win) return
        win.show()
        win.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        setIsQuitting(true)
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    const win = getMainWindow()
    win?.show()
    win?.focus()
  })
  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
