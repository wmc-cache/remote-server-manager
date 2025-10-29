<template>
  <div class="layout">
    <aside class="sidebar">
      <ServerList
        :connections="store.connections"
        :selected="store.selectedConnectionId"
        @select="handleConnect"
        @delete="store.deleteConnection"
      />
      <ConnectionForm @submit="store.saveConnection" />
    </aside>
    <main class="main">
      <section class="status-bar">
        <span>连接状态：{{ statusText }}</span>
        <span v-if="store.connectionMessage" class="status-bar__message">{{ store.connectionMessage }}</span>
      </section>
      <section class="grid grid--columns">
        <RemoteExplorer
          :entries="store.remoteEntries"
          :current-path="store.remotePath"
          :loading="store.isLoadingRemote"
          @change-path="store.fetchRemoteDirectory"
          @refresh="store.fetchRemoteDirectory"
          @preview="store.previewRemoteFile"
        />
        <article class="panel preview">
          <header>
            <h2>文件预览</h2>
          </header>
          <div v-if="!store.previewFile" class="panel__empty">双击文件或点击“预览”查看内容</div>
          <pre v-else class="preview__content">{{ store.previewFile.content }}</pre>
        </article>
      </section>
      <section class="grid">
        <TerminalPanel :history="store.terminalHistory" @execute="store.executeCommand" />
        <SyncConfigList
          :mappings="store.syncMappings"
          :is-syncing="store.isSyncing"
          @save="handleSaveSync"
          @start="handleStartSync"
          @stop="store.stopSync"
          @remove="store.deleteSyncMapping"
        />
        <SyncStatusLog :logs="store.syncLogs" />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import ServerList from './components/ServerList.vue';
import ConnectionForm from './components/ConnectionForm.vue';
import RemoteExplorer from './components/RemoteExplorer.vue';
import TerminalPanel from './components/TerminalPanel.vue';
import SyncConfigList from './components/SyncConfigList.vue';
import SyncStatusLog from './components/SyncStatusLog.vue';
import { useMainStore } from './store/mainStore';

const store = useMainStore();

onMounted(async () => {
  await Promise.all([store.loadConnections(), store.loadSyncMappings()]);
  store.listenSyncLog();
});

const statusText = computed(() => {
  switch (store.connectionStatus) {
    case 'connected':
      return '已连接';
    case 'connecting':
      return '连接中...';
    case 'error':
      return '连接失败';
    default:
      return '未连接';
  }
});

function handleConnect(id) {
  store.connect(id);
}

async function handleSaveSync(mapping) {
  if (!mapping.localPath || !mapping.remotePath) {
    store.pushLog({ level: 'warn', message: '请填写完整的本地与远程目录', timestamp: new Date().toISOString() });
    return;
  }
  if (!store.selectedConnectionId) {
    store.pushLog({ level: 'warn', message: '请先连接服务器后再配置同步任务', timestamp: new Date().toISOString() });
    return;
  }
  const payload = await store.saveSyncMapping({
    ...mapping,
    connectionId: store.selectedConnectionId,
  });
  if (mapping.mode === 'upload') {
    await store.startSync(payload);
  }
}

async function handleStartSync(mapping) {
  await store.startSync(mapping);
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 320px 1fr;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: #e2e8f0;
}

.sidebar {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: rgba(2, 6, 23, 0.65);
  border-right: 1px solid rgba(148, 163, 184, 0.2);
}

.main {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.status-bar {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(30, 41, 59, 0.7);
  border-radius: 10px;
}

.status-bar__message {
  color: #f87171;
}

.grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.grid--columns {
  grid-template-columns: 2fr 1fr;
}

.panel {
  background: rgba(15, 23, 42, 0.75);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel__empty {
  color: #94a3b8;
}

.preview__content {
  white-space: pre-wrap;
  background: rgba(30, 41, 59, 0.9);
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
}

@media (max-width: 1280px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    flex-direction: row;
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
