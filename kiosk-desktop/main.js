'use strict';

const { app, BrowserWindow, ipcMain, globalShortcut, dialog, screen } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let canClose = false; // locked until admin authenticates

// ── Window Creation ──────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: !isDev,
    kiosk: false,          // Allow OS-level shortcuts like Alt+Tab and task manager
    frame: true,           // Show standard window controls
    resizable: true,
    movable: true,
    backgroundColor: '#0a0a1a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show when ready — prevents white flash on startup
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Removed alwaysOnTop to prevent blocking Task Manager
  });

  // Removed close blocker so users can click the standard X button
  
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Admin quit — called only after admin PIN verified in renderer
ipcMain.handle('quit-app', async () => {
  canClose = true;
  globalShortcut.unregisterAll();
  app.quit();
});

// Open dev tools (dev mode only)
ipcMain.handle('open-devtools', () => {
  if (isDev && mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
});

// Toggle fullscreen (dev mode only)
ipcMain.handle('toggle-fullscreen', () => {
  if (isDev && mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
