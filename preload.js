const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveGCode:     (data) => ipcRenderer.invoke('save-gcode', data),
  saveSVG:       (data) => ipcRenderer.invoke('save-svg', data),
  saveSession:   (data) => ipcRenderer.invoke('save-session', data),
  loadSession:   ()     => ipcRenderer.invoke('load-session'),
  version:       ipcRenderer.sendSync('get-version'),
});
