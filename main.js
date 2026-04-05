const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu } = require('electron');
Menu.setApplicationMenu(null);
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Box Generator - CNC',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile('renderer/index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register('Ctrl+Shift+I', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });
  globalShortcut.register('Ctrl+R', () => {
    if (mainWindow) mainWindow.webContents.reload();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: Version
ipcMain.on('get-version', e => { e.returnValue = app.getVersion(); });

// IPC: Save G-code file
ipcMain.handle('save-gcode', async (event, { content, defaultName }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer le G-code',
    defaultPath: defaultName || 'output.nc',
    filters: [
      { name: 'G-code CNC', extensions: ['nc', 'gcode', 'tap'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  }
  return { success: false };
});

// IPC: Save session
ipcMain.handle('save-session', async (event, { content, defaultName }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Sauvegarder la session',
    defaultPath: defaultName || 'session.json',
    filters: [{ name: 'Session BoxGenerator', extensions: ['json'] }]
  });
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  }
  return { success: false };
});

// IPC: Load session
ipcMain.handle('load-session', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Ouvrir une session',
    filters: [{ name: 'Session BoxGenerator', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (filePaths && filePaths[0]) {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    return { success: true, content };
  }
  return { success: false };
});

// IPC: Save SVG preview
ipcMain.handle('save-svg', async (event, { content, defaultName }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer le SVG',
    defaultPath: defaultName || 'preview.svg',
    filters: [{ name: 'SVG', extensions: ['svg'] }]
  });
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  }
  return { success: false };
});
