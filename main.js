const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu } = require('electron');
Menu.setApplicationMenu(null);
const path = require('path');
const fs = require('fs');

let mainWindow;
let sessionPath = null;   // fichier de session ouvert ou enregistré : « Enregistrer » écrit directement dessus
const BACKUP_DIR = 'sauvegardes';   // sous-dossier (à côté du fichier) des copies .bak de la version précédente

/** Écrit la session ; la version précédente est copiée dans <dossier>/sauvegardes/<nom>.bak (une seule par fichier). */
function writeSessionFile(filePath, content) {
  if (fs.existsSync(filePath)) {
    if (fs.readFileSync(filePath, 'utf8') === content) return;   // rien n'a changé
    const bakDir = path.join(path.dirname(filePath), BACKUP_DIR);
    fs.mkdirSync(bakDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(bakDir, path.basename(filePath) + '.bak'));
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

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
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.ico'),
    backgroundColor: '#1e1e1e'
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
// « Enregistrer » : directement sur le fichier connu ; « Enregistrer sous » (saveAs), premier enregistrement ou
// dossier disparu : explorateur. Le chemin reste ici : l'interface ne choisit jamais où écrire.
ipcMain.handle('save-session', async (event, { content, defaultName, saveAs }) => {
  let target = !saveAs && sessionPath && fs.existsSync(path.dirname(sessionPath)) ? sessionPath : null;
  if (!target) {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Sauvegarder la session',
      defaultPath: sessionPath || defaultName || 'session.json',
      filters: [{ name: 'Session BoxGenerator', extensions: ['json'] }]
    });
    if (!filePath) return { success: false };
    target = filePath;
  }
  try {
    writeSessionFile(target, content);
  } catch (e) {
    return { success: false, error: e.message };
  }
  sessionPath = target;
  return { success: true, path: target, name: path.basename(target) };
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
    sessionPath = filePaths[0];
    return { success: true, content, path: sessionPath, name: path.basename(sessionPath) };
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
