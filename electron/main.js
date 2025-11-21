const path = require('path');
const { randomUUID } = require('crypto');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const ConnectionStore = require('./services/connectionStore');
const SSHClientService = require('./services/sshClient');
const createSyncService = require('./services/fileSync');
const { getAIService } = require('./services/aiService');

const isDev = !app.isPackaged;
const connectionStore = new ConnectionStore();
const sshClientService = new SSHClientService();
const syncService = createSyncService(sshClientService);
const aiService = getAIService();
// 启动时加载已保存的 AI 配置，避免重启后需要重新保存
aiService.updateConfig(connectionStore.getDeepSeekConfig());

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

ipcMain.handle('ssh:stat', async (_event, { connectionId, remotePath }) => {
  try {
    const stat = await sshClientService.statPath(connectionId, remotePath);
    return { ok: true, stat };
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

ipcMain.handle('ssh:download-file', async (_event, { connectionId, remotePath, localPath }) => {
  try {
    await sshClientService.downloadFile(connectionId, remotePath, localPath);
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

// Streaming execution: emits 'terminal:data' events with { execId, type, data|code }
ipcMain.handle('ssh:exec-stream', async (_event, { connectionId, command }) => {
  return new Promise((resolve, reject) => {
    try {
      const execId = randomUUID();
      const client = sshClientService.ensureConnection(connectionId);
      client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        // announce start
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:data', { execId, type: 'start', command });
        }
        stream
          .on('data', (chunk) => {
            const data = chunk?.toString?.() ?? String(chunk);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:data', { execId, type: 'stdout', data });
            }
          })
          .stderr.on('data', (chunk) => {
            const data = chunk?.toString?.() ?? String(chunk);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:data', { execId, type: 'stderr', data });
            }
          });
        stream.on('close', (code) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:data', { execId, type: 'end', code });
          }
        });
        // return immediately with execId
        resolve({ ok: true, execId });
      });
    } catch (e) {
      reject(e);
    }
  });
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

ipcMain.handle('sync:pick-local-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('sync:list', async () => {
  return connectionStore.getSyncMappings();
});

ipcMain.handle('file:pick-save', async (_event, { defaultPath } = {}) => {
  const result = await dialog.showSaveDialog({ defaultPath });
  if (result.canceled) return null;
  return result.filePath;
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

// DeepSeek AI IPC handlers
const aiResponseStreams = {}; // execId -> { onData: Function }

// 加载 DeepSeek 配置
ipcMain.handle('ai:load-config', () => {
  const config = connectionStore.getDeepSeekConfig();
  aiService.updateConfig(config);
  return config;
});

// 保存 DeepSeek 配置
ipcMain.handle('ai:save-config', (_event, config) => {
  aiService.updateConfig(config);
  connectionStore.setDeepSeekConfig(config);
  return { ok: true };
});

// 生成命令（支持流式响应）
ipcMain.handle('ai:generate-command', async (_event, { prompt, execId }) => {
  try {
    aiResponseStreams[execId] = {
      id: execId,
      createdAt: Date.now(),
    };

    const fullResponse = await aiService.generateCommand(prompt, (chunk) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:stream-data', {
          execId,
          type: 'data',
          chunk,
        });
      }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai:stream-data', {
        execId,
        type: 'end',
        fullResponse,
      });
    }

    delete aiResponseStreams[execId];
    return { ok: true, execId };
  } catch (error) {
    delete aiResponseStreams[execId];
    return { ok: false, message: error.message };
  }
});

// 解释命令（支持流式响应）
ipcMain.handle('ai:explain-command', async (_event, { command, stdout, stderr, execId }) => {
  try {
    aiResponseStreams[execId] = {
      id: execId,
      createdAt: Date.now(),
    };

    const fullResponse = await aiService.explainCommand(command, stdout, stderr, (chunk) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:stream-data', {
          execId,
          type: 'data',
          chunk,
        });
      }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai:stream-data', {
        execId,
        type: 'end',
        fullResponse,
      });
    }

    delete aiResponseStreams[execId];
    return { ok: true, execId };
  } catch (error) {
    delete aiResponseStreams[execId];
    return { ok: false, message: error.message };
  }
});

// 查找文件位置（支持流式响应）
ipcMain.handle('ai:find-file', async (_event, { query, execId }) => {
  try {
    aiResponseStreams[execId] = {
      id: execId,
      createdAt: Date.now(),
    };

    const fullResponse = await aiService.findFileLocation(query, (chunk) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:stream-data', {
          execId,
          type: 'data',
          chunk,
        });
      }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai:stream-data', {
        execId,
        type: 'end',
        fullResponse,
      });
    }

    delete aiResponseStreams[execId];
    return { ok: true, execId };
  } catch (error) {
    delete aiResponseStreams[execId];
    return { ok: false, message: error.message };
  }
});

module.exports = { createWindow };
