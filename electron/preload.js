const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('api', {
  listConnections: () => invoke('connections:list'),
  saveConnection: (connection) => invoke('connections:upsert', connection),
  deleteConnection: (id) => invoke('connections:delete', id),

  connect: (config) => invoke('ssh:connect', config),
  listDirectory: (connectionId, remotePath) => invoke('ssh:list-directory', { connectionId, remotePath }),
  readFile: (connectionId, remotePath) => invoke('ssh:read-file', { connectionId, remotePath }),
  readFileBinary: (connectionId, remotePath) => invoke('ssh:read-file-binary', { connectionId, remotePath }),
  statPath: (connectionId, remotePath) => invoke('ssh:stat', { connectionId, remotePath }),
  downloadFile: (connectionId, remotePath, localPath) => invoke('ssh:download-file', { connectionId, remotePath, localPath }),
  writeFile: (connectionId, remotePath, content) =>
    invoke('ssh:write-file', { connectionId, remotePath, content }),
  deleteFile: (connectionId, remotePath) =>
    invoke('ssh:delete-file', { connectionId, remotePath }),
  deletePath: (connectionId, remotePath, options = {}) =>
    invoke('ssh:delete-path', { connectionId, remotePath, recursive: options.recursive !== false }),
  executeCommand: (connectionId, command) => invoke('ssh:execute', { connectionId, command }),
  execStream: (connectionId, command) => invoke('ssh:exec-stream', { connectionId, command }),

  startSync: (payload) => invoke('sync:start', payload),
  stopSync: (syncId) => invoke('sync:stop', syncId),
  listSyncMappings: () => invoke('sync:list'),
  saveSyncMapping: (mapping) => invoke('sync:upsert', mapping),
  deleteSyncMapping: (syncId) => invoke('sync:delete', syncId),
  pickLocalFolder: () => invoke('sync:pick-local-folder'),
  pickLocalSave: (defaultPath) => invoke('file:pick-save', { defaultPath }),
  pickLocalFile: () => invoke('sync:pick-local-file'),

  onSyncLog: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('sync:log', handler);
    return () => ipcRenderer.removeListener('sync:log', handler);
  },

  onTerminalData: (callback) => {
    ipcRenderer.on('terminal:data', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('terminal:data');
  },

  // DeepSeek AI API
  loadDeepSeekConfig: () => invoke('ai:load-config'),
  saveDeepSeekConfig: (config) => invoke('ai:save-config', config),
  aiGenerateCommand: ({ prompt, execId }) => invoke('ai:generate-command', { prompt, execId }),
  aiExplainCommand: ({ command, stdout, stderr, execId }) =>
    invoke('ai:explain-command', { command, stdout, stderr, execId }),
  aiFindFile: ({ query, execId }) => invoke('ai:find-file', { query, execId }),

  onAIStreamData: (callback) => {
    ipcRenderer.on('ai:stream-data', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('ai:stream-data');
  },
});
