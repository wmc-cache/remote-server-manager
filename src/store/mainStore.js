import { defineStore } from 'pinia';

const initialRemotePath = '/';

export const useMainStore = defineStore('main', {
  state: () => ({
    connections: [],
    syncMappings: [],
    selectedConnectionId: null,
    connectionStatus: 'idle',
    connectionMessage: '',
    remotePath: initialRemotePath,
    remoteEntries: [],
    previewFile: null,
    terminalHistory: [],
    syncLogs: [],
    isLoadingConnections: false,
    isLoadingRemote: false,
    isSyncing: false,
  }),
  actions: {
    pushLog(entry) {
      this.syncLogs = [entry, ...this.syncLogs].slice(0, 200);
    },

    async loadConnections() {
      this.isLoadingConnections = true;
      try {
        const list = await window.api.listConnections();
        this.connections = list;
        if (list.length && !this.selectedConnectionId) {
          this.selectedConnectionId = list[0].id;
        }
      } finally {
        this.isLoadingConnections = false;
      }
    },

    async saveConnection(connection) {
      const saved = await window.api.saveConnection(connection);
      await this.loadConnections();
      if (saved?.id) {
        this.selectedConnectionId = saved.id;
      }
    },

    async deleteConnection(id) {
      await window.api.deleteConnection(id);
      if (this.selectedConnectionId === id) {
        this.selectedConnectionId = null;
        this.remoteEntries = [];
        this.connectionStatus = 'idle';
      }
      await this.loadConnections();
    },

    async connect(connectionId) {
      const target = this.connections.find((item) => item.id === connectionId);
      if (!target) {
        this.connectionStatus = 'error';
        this.connectionMessage = '未找到连接配置';
        return;
      }
      this.connectionStatus = 'connecting';
      this.connectionMessage = '';
      try {
        const result = await window.api.connect(target);
        if (!result.ok) {
          throw new Error(result.message);
        }
        this.connectionStatus = 'connected';
        this.selectedConnectionId = result.connectionId;
        await this.fetchRemoteDirectory(this.remotePath);
      } catch (error) {
        this.connectionStatus = 'error';
        this.connectionMessage = error.message;
      }
    },

    async fetchRemoteDirectory(remotePathOverride) {
      if (!this.selectedConnectionId) {
        this.connectionMessage = '请先建立连接';
        return;
      }
      this.isLoadingRemote = true;
      const nextPath = remotePathOverride || this.remotePath || initialRemotePath;
      try {
        const entries = await window.api.listDirectory(this.selectedConnectionId, nextPath);
        this.remoteEntries = entries.sort((a, b) => {
          const aDir = a.attrs?.isDirectory ? -1 : 1;
          const bDir = b.attrs?.isDirectory ? -1 : 1;
          if (aDir !== bDir) {
            return aDir - bDir;
          }
          return a.filename.localeCompare(b.filename);
        });
        this.remotePath = nextPath;
      } catch (error) {
        this.connectionMessage = error.message;
      } finally {
        this.isLoadingRemote = false;
      }
    },

    async previewRemoteFile(remotePath) {
      if (!this.selectedConnectionId) {
        return;
      }
      try {
        const content = await window.api.readFile(this.selectedConnectionId, remotePath);
        this.previewFile = { path: remotePath, content };
      } catch (error) {
        this.connectionMessage = error.message;
      }
    },

    async executeCommand(command) {
      if (!this.selectedConnectionId || !command) {
        return;
      }
      const result = await window.api.executeCommand(this.selectedConnectionId, command);
      this.terminalHistory.unshift({
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        timestamp: new Date().toISOString(),
      });
      this.terminalHistory = this.terminalHistory.slice(0, 100);
    },

    async loadSyncMappings() {
      const mappings = await window.api.listSyncMappings();
      this.syncMappings = mappings;
    },

    async saveSyncMapping(mapping) {
      const payload = await window.api.saveSyncMapping(mapping);
      await this.loadSyncMappings();
      return payload;
    },

    async deleteSyncMapping(id) {
      await window.api.deleteSyncMapping(id);
      await this.loadSyncMappings();
    },

    async startSync(mapping) {
      this.isSyncing = true;
      try {
        const connectionId = mapping.connectionId || this.selectedConnectionId;
        if (!connectionId) {
          throw new Error('请先选择一个服务器连接');
        }
        const result = await window.api.startSync({
          ...mapping,
          connectionId,
        });
        if (!result.ok) {
          throw new Error(result.message);
        }
        this.pushLog({ level: 'info', message: `同步任务 ${result.syncId} 已启动`, timestamp: new Date().toISOString() });
        await this.loadSyncMappings();
      } catch (error) {
        this.pushLog({ level: 'error', message: error.message, timestamp: new Date().toISOString() });
      } finally {
        this.isSyncing = false;
      }
    },

    async stopSync(syncId) {
      await window.api.stopSync(syncId);
      this.pushLog({ level: 'info', message: `同步任务 ${syncId} 已停止`, timestamp: new Date().toISOString() });
    },

    listenSyncLog() {
      if (!window.api.onSyncLog) {
        return;
      }
      window.api.onSyncLog((entry) => {
        this.pushLog({ ...entry, timestamp: new Date().toISOString() });
      });
    },
  },
});
