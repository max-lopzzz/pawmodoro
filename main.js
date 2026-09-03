const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')

let win
let pendingDeepLink = null

app.setAsDefaultProtocolClient('pawmodoro')

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (win && !win.webContents.isLoading()) {
    win.webContents.send('auth-deep-link', url)
  } else if (win) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('auth-deep-link', url)
    })
  } else {
    pendingDeepLink = url
  }
})

function createWindow() {
  win = new BrowserWindow({
    width: 740,
    height: 580,
    minWidth: 740,
    minHeight: 580,
    resizable: true,
    frame: false,
    icon: path.join(__dirname, 'assets/icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile('renderer/index.html')
  if (pendingDeepLink) {
    const deferredUrl = pendingDeepLink
    pendingDeepLink = null
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('auth-deep-link', deferredUrl)
    })
  }
}

app.whenReady().then(() => {
  if (app.dock) app.dock.setIcon(path.join(__dirname, 'assets/icon.icns'))
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.on('window-close', () => win.close())
ipcMain.on('window-minimize', () => win.minimize())
ipcMain.on('open-external', (_, url) => shell.openExternal(url))
