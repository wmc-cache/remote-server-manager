import { defineStore } from 'pinia';

const initialRemotePath = '/';

export const useMainStore = defineStore('main', {
  state: () => ({
    connections: [],
    syncMappings: [],
    activeSyncIds: [],
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
    escapeShellArg(value) {
      if (!value) {
        return "''";
      }
      return `'${value.replace(/'/g, `'\\''`)}'`;
    },

    normalizeError(error) {
      if (!error) {
        return '';
      }
      const message = error.message || String(error);
      if (/channel open failure/i.test(message)) {
        return '无法打开 SFTP 通道，请确认远程服务器已启用 SFTP（例如安装 openssh-sftp-server 并在 sshd_config 中开启）。';
      }
      return message;
    },

    pushLog(entry) {
      this.syncLogs = [entry, ...this.syncLogs].slice(0, 200);
    },

    async loadConnections() {
      this.isLoadingConnections = true;
      try {
        const list = await window.api.listConnections();
        this.connections = list;
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
        this.connectionMessage = '';
        this.remotePath = initialRemotePath;
        this.activeSyncIds = [];
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
      const payload = JSON.parse(JSON.stringify(target));
      this.connectionStatus = 'connecting';
      this.connectionMessage = '';
      try {
        const result = await window.api.connect(payload);
        if (!result.ok) {
          throw new Error(result.message);
        }
        this.selectedConnectionId = result.connectionId;
        const success = await this.fetchRemoteDirectory(this.remotePath);
        if (success) {
          this.connectionStatus = 'connected';
        } else {
          this.connectionStatus = 'error';
        }
      } catch (error) {
        this.connectionStatus = 'error';
        this.connectionMessage = this.normalizeError(error);
      }
    },

    async fetchRemoteDirectory(remotePathOverride) {
      if (!this.selectedConnectionId) {
        this.connectionMessage = '请先建立连接';
        return false;
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
        this.connectionMessage = '';
        return true;
      } catch (error) {
        this.connectionMessage = this.normalizeError(error);
        return false;
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
        this.connectionMessage = this.normalizeError(error);
      }
    },

    async executeCommand(command) {
      if (!this.selectedConnectionId || !command) {
        return;
      }
      const cwd = this.remotePath || initialRemotePath;
      const prepared = `cd ${this.escapeShellArg(cwd)} && ${command}`;
      const result = await window.api.executeCommand(this.selectedConnectionId, prepared);
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
      const validIds = new Set(mappings.map((item) => item.id));
      this.activeSyncIds = this.activeSyncIds.filter((id) => validIds.has(id));
    },

    async saveSyncMapping(mapping) {
      const payload = await window.api.saveSyncMapping(mapping);
      await this.loadSyncMappings();
      return payload;
    },

    async deleteSyncMapping(id) {
      await window.api.deleteSyncMapping(id);
      this.activeSyncIds = this.activeSyncIds.filter((item) => item !== id);
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
        if (!this.activeSyncIds.includes(result.syncId)) {
          this.activeSyncIds = [...this.activeSyncIds, result.syncId];
        }
        if ((mapping.mode || 'bidirectional') === 'bidirectional') {
          this.pushLog({
            level: 'warn',
            message: '双向同步仍在开发中，当前任务仅会执行本地 → 远程。',
            timestamp: new Date().toISOString(),
          });
        }
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
      this.activeSyncIds = this.activeSyncIds.filter((item) => item !== syncId);
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
