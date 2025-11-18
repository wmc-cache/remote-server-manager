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
    isSavingFile: false,
    theme: 'theme-sky',
    previewWatchTimer: null,
    previewWatchStat: null,
    // execId -> { stdoutBuf: string, stderrBuf: string, timer: any, ended: boolean, pendingCode: number|null }
    terminalStreams: {},
    // DeepSeek AI 配置
    deepSeekConfig: {
      apiKey: '',
      apiBaseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: false,
    },
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

    async previewRemoteFile(remotePath, options = {}) {
      if (!this.selectedConnectionId) {
        return;
      }
      const fromWatcher = options.fromWatcher === true;
      const ext = (remotePath.split('.').pop() || '').toLowerCase();
      const binaryExts = new Set([
        'pdf', 'docx', 'xlsx',
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
        'mp3', 'wav', 'ogg', 'm4a',
        'mp4', 'webm', 'mov'
      ]);
      try {
        if (binaryExts.has(ext)) {
          const result = await window.api.readFileBinary(this.selectedConnectionId, remotePath);
          if (!result?.ok) {
            throw new Error(result?.message || '读取文件失败');
          }
          this.previewFile = { path: remotePath, content: result.base64, encoding: 'base64' };
          if (!fromWatcher) this.startPreviewWatch(remotePath);
          return;
        }
        const content = await window.api.readFile(this.selectedConnectionId, remotePath);
        this.previewFile = { path: remotePath, content, encoding: 'text' };
        if (!fromWatcher) this.startPreviewWatch(remotePath);
      } catch (error) {
        this.connectionMessage = this.normalizeError(error);
      }
    },

    stopPreviewWatch() {
      if (this.previewWatchTimer) {
        clearInterval(this.previewWatchTimer);
        this.previewWatchTimer = null;
      }
      this.previewWatchStat = null;
    },

    async startPreviewWatch(remotePath) {
      this.stopPreviewWatch();
      if (!this.selectedConnectionId || !remotePath) return;
      const connectionId = this.selectedConnectionId;
      const check = async () => {
        try {
          const { stat } = await window.api.statPath(connectionId, remotePath);
          if (!stat) {
            // 文件不存在，停止并清空
            this.stopPreviewWatch();
            if (this.previewFile?.path === remotePath) {
              this.previewFile = null;
            }
            return;
          }
          const last = this.previewWatchStat || {};
          if (!last.mtimeMs || stat.mtimeMs !== last.mtimeMs || stat.size !== last.size) {
            this.previewWatchStat = { mtimeMs: stat.mtimeMs, size: stat.size };
            // 刷新内容，但不重启 watcher
            await this.previewRemoteFile(remotePath, { fromWatcher: true });
          }
        } catch (e) {
          // 忽略临时错误
        }
      };
      // 初始化一次 stat
      try {
        const { stat } = await window.api.statPath(connectionId, remotePath);
        if (stat) this.previewWatchStat = { mtimeMs: stat.mtimeMs, size: stat.size };
      } catch (_) {}
      this.previewWatchTimer = setInterval(check, 2000);
    },

    async saveRemoteFile(newContent) {
      if (!this.selectedConnectionId || !this.previewFile?.path) {
        const message = '请先选择需要编辑的远程文件';
        this.connectionMessage = message;
        return { ok: false, message };
      }
      this.isSavingFile = true;
      try {
        const result = await window.api.writeFile(
          this.selectedConnectionId,
          this.previewFile.path,
          newContent,
        );
        if (result?.ok === false) {
          throw new Error(result.message);
        }
        this.previewFile = { ...this.previewFile, content: newContent };
        await this.fetchRemoteDirectory(this.remotePath);
        return { ok: true };
      } catch (error) {
        const message = this.normalizeError(error);
        this.connectionMessage = message;
        return { ok: false, message };
      } finally {
        this.isSavingFile = false;
      }
    },

    async deleteRemoteFile(targetPath) {
      if (!this.selectedConnectionId || !targetPath) {
        return { ok: false, message: '未选择连接或路径无效' };
      }
      try {
        const result = await window.api.deleteFile(this.selectedConnectionId, targetPath);
        if (result?.ok === false) {
          throw new Error(result.message);
        }
        if (this.previewFile?.path === targetPath) {
          this.previewFile = null;
          this.stopPreviewWatch();
        }
        await this.fetchRemoteDirectory(this.remotePath);
        return { ok: true };
      } catch (error) {
        const message = this.normalizeError(error);
        this.connectionMessage = message;
        return { ok: false, message };
      }
    },

    async deleteRemotePath(payload) {
      const targetPath = typeof payload === 'string' ? payload : payload?.path;
      const recursive = typeof payload === 'object' ? payload?.recursive !== false : true;
      if (!this.selectedConnectionId || !targetPath) {
        return { ok: false, message: '未选择连接或路径无效' };
      }
      try {
        const result = await window.api.deletePath(this.selectedConnectionId, targetPath, { recursive });
        if (result?.ok === false) {
          throw new Error(result.message);
        }
        if (this.previewFile?.path && this.previewFile.path.startsWith(targetPath)) {
          this.previewFile = null;
          this.stopPreviewWatch();
        }
        await this.fetchRemoteDirectory(this.remotePath);
        return { ok: true };
      } catch (error) {
        const message = this.normalizeError(error);
        this.connectionMessage = message;
        return { ok: false, message };
      }
    },

    async executeCommand(command) {
      if (!this.selectedConnectionId || !command) return;
      const cwd = this.remotePath || initialRemotePath;
      const prepared = `cd ${this.escapeShellArg(cwd)} && ${command}`;
      if (window.api.execStream && window.api.onTerminalData) {
        try {
          const result = await window.api.execStream(this.selectedConnectionId, prepared);
          if (result?.ok && result.execId) {
            const entry = {
              id: result.execId,
              command,
              stdout: '',
              stderr: '',
              code: null,
              timestamp: new Date().toISOString(),
            };
            this.terminalHistory.unshift(entry);
            this.terminalHistory = this.terminalHistory.slice(0, 100);
            return;
          }
        } catch (e) {
          // fallback to non-streaming
        }
      }
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

    async downloadRemoteFile(remotePath) {
      if (!this.selectedConnectionId || !remotePath) return;
      try {
        const defaultName = (remotePath.split('/').pop() || 'download');
        const localPath = await window.api.pickLocalSave?.(defaultName);
        if (!localPath) return;
        const result = await window.api.downloadFile(this.selectedConnectionId, remotePath, localPath);
        if (result?.ok === false) {
          throw new Error(result.message);
        }
        this.pushLog({ level: 'info', message: `已下载: ${remotePath} -> ${localPath}`, timestamp: new Date().toISOString() });
      } catch (error) {
        this.connectionMessage = this.normalizeError(error);
      }
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
        if (!this.activeSyncIds.includes(result.syncId)) {
          this.activeSyncIds = [...this.activeSyncIds, result.syncId];
        }
        // 双向同步由主进程负责拉取远端变化并回写本地
        await this.loadSyncMappings();
      } catch (error) {
        this.pushLog({ level: 'error', message: error.message, timestamp: new Date().toISOString() });
      } finally {
        this.isSyncing = false;
      }
    },

    async stopSync(syncId) {
      await window.api.stopSync(syncId);
      this.activeSyncIds = this.activeSyncIds.filter((item) => item !== syncId);
    },

    applyTheme(theme) {
      const root = document.documentElement;
      const classes = Array.from(root.classList).filter((c) => c.startsWith('theme-'));
      classes.forEach((c) => root.classList.remove(c));
      if (theme) {
        root.classList.add(theme);
      }
    },

    initTheme() {
      const saved = localStorage.getItem('rsm-theme') || 'theme-sky';
      this.theme = saved;
      this.applyTheme(saved);
    },

    setTheme(theme) {
      this.theme = theme;
      localStorage.setItem('rsm-theme', theme);
      this.applyTheme(theme);
    },

    listenSyncLog() {
      if (!window.api.onSyncLog) {
        return;
      }
      window.api.onSyncLog((entry) => {
        this.pushLog({ ...entry, timestamp: new Date().toISOString() });
      });
    },

    listenTerminalData() {
      if (!window.api.onTerminalData) return;
      const perTick = 3; // characters per 33ms
      const tick = (id) => {
        const stream = this.terminalStreams[id];
        if (!stream) return;
        const idx = this.terminalHistory.findIndex((i) => i.id === id);
        if (idx === -1) { clearInterval(stream.timer); delete this.terminalStreams[id]; return; }
        const entry = this.terminalHistory[idx];
        let changed = false;
        for (let n = 0; n < perTick; n += 1) {
          let ch = '';
          if (stream.stdoutBuf && stream.stdoutBuf.length) {
            ch = stream.stdoutBuf.slice(0, 1);
            stream.stdoutBuf = stream.stdoutBuf.slice(1);
            entry.stdout = (entry.stdout || '') + ch;
            changed = true;
          } else if (stream.stderrBuf && stream.stderrBuf.length) {
            ch = stream.stderrBuf.slice(0, 1);
            stream.stderrBuf = stream.stderrBuf.slice(1);
            entry.stderr = (entry.stderr || '') + ch;
            changed = true;
          } else {
            break;
          }
        }
        if (changed) {
          // force reactivity
          this.terminalHistory.splice(idx, 1, { ...entry });
        }
        if (!stream.stdoutBuf && !stream.stderrBuf && stream.ended) {
          clearInterval(stream.timer);
          stream.timer = null;
          if (typeof stream.pendingCode === 'number') {
            this.terminalHistory.splice(idx, 1, { ...entry, code: stream.pendingCode, timestamp: new Date().toISOString() });
          }
          delete this.terminalStreams[id];
        }
      };

      window.api.onTerminalData((payload) => {
        const { execId, type, data, code } = payload || {};
        if (!execId) return;
        // Ensure entry exists
        const idx = this.terminalHistory.findIndex((i) => i.id === execId);
        if (idx === -1) return;
        if (!this.terminalStreams[execId]) {
          this.terminalStreams[execId] = { stdoutBuf: '', stderrBuf: '', timer: null, ended: false, pendingCode: null };
        }
        const stream = this.terminalStreams[execId];
        if (type === 'stdout') {
          stream.stdoutBuf += (data || '');
        } else if (type === 'stderr') {
          stream.stderrBuf += (data || '');
        } else if (type === 'end') {
          stream.ended = true;
          stream.pendingCode = typeof code === 'number' ? code : null;
        }
        if (!stream.timer) {
          stream.timer = setInterval(() => tick(execId), 33);
        }
      });
    },

    // DeepSeek AI 配置管理
    async loadDeepSeekConfig() {
      try {
        const config = await window.api.loadDeepSeekConfig();
        if (config) {
          this.deepSeekConfig = {
            apiKey: config.apiKey || '',
            apiBaseUrl: config.apiBaseUrl || 'https://api.deepseek.com',
            model: config.model || 'deepseek-chat',
            enabled: config.enabled || false,
          };
        }
      } catch (error) {
        console.error('加载 DeepSeek 配置失败:', error);
      }
    },

    async saveDeepSeekConfig(config) {
      try {
        const result = await window.api.saveDeepSeekConfig({
          ...this.deepSeekConfig,
          ...config,
        });
        if (result?.ok) {
          this.deepSeekConfig = {
            apiKey: config.apiKey || '',
            apiBaseUrl: config.apiBaseUrl || 'https://api.deepseek.com',
            model: config.model || 'deepseek-chat',
            enabled: config.enabled || false,
          };
        }
        return result;
      } catch (error) {
        console.error('保存 DeepSeek 配置失败:', error);
        return { ok: false, message: error.message };
      }
    },

    // AI 助手相关方法
    async aiGenerateCommand(prompt) {
      if (!this.deepSeekConfig.apiKey || !this.deepSeekConfig.enabled) {
        return { ok: false, message: 'DeepSeek 未配置或未启用' };
      }
      try {
        const result = await window.api.aiGenerateCommand({
          prompt,
          config: this.deepSeekConfig,
        });
        return result;
      } catch (error) {
        return { ok: false, message: error.message };
      }
    },

    async aiExplainCommand(command, stdout, stderr) {
      if (!this.deepSeekConfig.apiKey || !this.deepSeekConfig.enabled) {
        return { ok: false, message: 'DeepSeek 未配置或未启用' };
      }
      try {
        const result = await window.api.aiExplainCommand({
          command,
          stdout,
          stderr,
          config: this.deepSeekConfig,
        });
        return result;
      } catch (error) {
        return { ok: false, message: error.message };
      }
    },
  },
});
