'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the renderer process
contextBridge.exposeInMainWorld('kiosk', {
  // Admin: quit the app (called after admin PIN verified)
  quit: () => ipcRenderer.invoke('quit-app'),

  // Dev helpers
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
});
