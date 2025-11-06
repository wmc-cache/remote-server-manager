const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const ConnectionStore = require('./services/connectionStore');
const SSHClientService = require('./services/sshClient');
const createSyncService = require('./services/fileSync');

const isDev = !app.isPackaged;
const connectionStore = new ConnectionStore();
const sshClientService = new SSHClientService();
const syncService = createSyncService(sshClientService);

let mainWindow;

syncService.emitter.on('sync:log', (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync:log', payload);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
    //mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Connection management handlers
ipcMain.handle('connections:list', () => connectionStore.getConnections());
ipcMain.handle('connections:upsert', async (_event, payload) => {
  const connection = await connectionStore.saveConnection(payload);
  return connection;
});
ipcMain.handle('connections:delete', async (_event, id) => {
  await connectionStore.deleteConnection(id);
  return true;
});

// SSH / Remote actions
ipcMain.handle('ssh:connect', async (_event, config) => {
  try {
    const connection = await sshClientService.connect(config);
    return { ok: true, connectionId: connection.id };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('ssh:list-directory', async (_event, { connectionId, remotePath }) => {
  return sshClientService.listDirectory(connectionId, remotePath);
});

ipcMain.handle('ssh:read-file', async (_event, { connectionId, remotePath }) => {
  return sshClientService.readFile(connectionId, remotePath);
});

ipcMain.handle('ssh:read-file-binary', async (_event, { connectionId, remotePath }) => {
  try {
    const base64 = await sshClientService.readFileBinary(connectionId, remotePath);
    return { ok: true, base64 };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('ssh:write-file', async (_event, { connectionId, remotePath, content }) => {
  try {
    await sshClientService.writeFile(connectionId, remotePath, content);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('ssh:delete-file', async (_event, { connectionId, remotePath }) => {
  try {
    await sshClientService.deleteFile(connectionId, remotePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('ssh:delete-path', async (_event, { connectionId, remotePath, recursive }) => {
  try {
    await sshClientService.deletePath(connectionId, remotePath, { recursive });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('ssh:execute', async (_event, { connectionId, command }) => {
  return sshClientService.executeCommand(connectionId, command);
});

ipcMain.handle('sync:start', async (_event, payload) => {
  try {
    const syncId = await syncService.startSync(payload);
    return { ok: true, syncId };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('sync:stop', async (_event, syncId) => {
  await syncService.stopSync(syncId);
  return true;
});

ipcMain.handle('sync:pick-local-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('sync:list', async () => {
  return connectionStore.getSyncMappings();
});

ipcMain.handle('sync:upsert', async (_event, mapping) => {
  const saved = await connectionStore.saveSyncMapping(mapping);
  return saved;
});

ipcMain.handle('sync:delete', async (_event, syncId) => {
  await connectionStore.deleteSyncMapping(syncId);
  await syncService.stopSync(syncId);
  return true;
});

module.exports = { createWindow };
