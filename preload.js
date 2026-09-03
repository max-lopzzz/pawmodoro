const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('windowControls', {
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize'),
  openExternal: (url) => ipcRenderer.send('open-external', url)
})

contextBridge.exposeInMainWorld('authBridge', {
  onDeepLink: (callback) => ipcRenderer.on('auth-deep-link', (_event, url) => callback(url))
})
