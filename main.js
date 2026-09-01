const { app, BrowserWindow, ipcMain } = require('electron');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });
  win.loadFile('browser.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.on('win-minimize', () => win?.minimize());
ipcMain.on('win-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('win-close', () => win?.close());
