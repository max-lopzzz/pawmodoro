const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

let win

function createWindow() {
  win = new BrowserWindow({
    width: 740,
    height: 580,
    resizable: false,
    frame: false,
    icon: path.join(__dirname, 'assets/icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile('renderer/index.html')
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
