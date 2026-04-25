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
    kiosk: !isDev,          // OS-level kiosk mode (blocks Alt+F4 on Windows)
    frame: false,
    resizable: isDev,
    movable: false,
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
    if (!isDev) mainWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  // Block close unless admin has unlocked
  mainWindow.on('close', (e) => {
    if (!canClose) e.preventDefault();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.on('ready', () => {
  createWindow();

  if (!isDev) {
    // Block all dangerous keyboard shortcuts in kiosk mode
    const blocked = [
      'Alt+F4', 'CommandOrControl+W', 'CommandOrControl+Q',
      'CommandOrControl+R', 'CommandOrControl+Shift+R',
      'F5', 'F11', 'F12',
      'CommandOrControl+Shift+I', 'CommandOrControl+Shift+J',
      'Alt+Tab', 'Meta+Tab', 'Meta+D',
    ];
    blocked.forEach(k => {
      try { globalShortcut.register(k, () => {}); } catch (_) {}
    });
  }
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
