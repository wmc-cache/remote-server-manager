<template>
  <div class="app">
    <ConnectionForm
      :visible="showCreateModal"
      :connection="editingConnection"
      @close="closeCreateModal"
      @submit="handleCreateConnection"
    />
    <FileEditorModal
      :visible="editorVisible"
      :file="store.previewFile"
      :saving="store.isSavingFile"
      :message="editorMessage"
      :message-type="editorMessageType"
      @close="closeEditor"
      @save="handleSaveFile"
    />

    <section v-if="!isDetailView" class="landing">
      <header class="landing__header">
        <div>
          <h1>远程服务器管理</h1>
          <p>集中管理 SSH 连接、远程文件与同步任务。</p>
        </div>
        <div class="header__actions">
          <ThemePicker @change="store.setTheme" />
          <button class="btn btn--primary" type="button" @click="openCreateModal">新增连接</button>
        </div>
      </header>

      <div v-if="!store.connections.length" class="landing__empty">
        暂无服务器，请点击“新增连接”完成配置。
      </div>
      <ServerList
        v-else
        :connections="store.connections"
        :selected="store.selectedConnectionId"
        @select="handleSelectConnection"
        @edit="openEditModal"
        @delete="handleDeleteConnection"
      />
    </section>

    <section v-else class="detail">
      <header class="detail__topbar">
        <button class="btn btn--ghost" type="button" @click="handleBackToList">← 返回列表</button>
        <div class="detail__status">
          <span>连接状态：{{ statusText }}</span>
          <span v-if="store.connectionMessage" class="detail__status-message">{{ store.connectionMessage }}</span>
        </div>
        <div class="header__actions">
          <ThemePicker @change="store.setTheme" />
          <div v-if="currentHostLabel" class="host-chip" :title="currentHostLabel">{{ currentHostLabel }}</div>
        </div>
      </header>

      <section class="detail__grid detail__grid--columns">
        <RemoteExplorer
          :entries="store.remoteEntries"
          :current-path="store.remotePath"
          :loading="store.isLoadingRemote"
          @change-path="store.fetchRemoteDirectory"
          @refresh="store.fetchRemoteDirectory"
          @preview="store.previewRemoteFile"
          @delete="handleDeleteFile"
        />
        <article class="panel preview">
          <header class="preview__header">
            <h2>文件预览</h2>
            <div class="header__actions">
              <button
                v-if="store.previewFile"
                class="btn btn--ghost"
                type="button"
                @click="openFullscreen"
              >
                全屏
              </button>
              <button
                v-if="store.previewFile && store.previewFile.encoding === 'text'"
                class="btn btn--ghost"
                type="button"
                @click="openEditor"
              >
                编辑
              </button>
            </div>
          </header>
          <div v-if="!store.previewFile" class="panel__empty">双击文件或点击“预览”查看内容</div>
          <FilePreview v-else :file="store.previewFile" />
        </article>
      </section>

      <section class="detail__grid">
        <TerminalPanel :history="store.terminalHistory" @execute="store.executeCommand" />
        <SyncConfigList
          :mappings="store.syncMappings"
          :is-syncing="store.isSyncing"
          :active-ids="store.activeSyncIds"
          @save="handleSaveSync"
          @start="handleStartSync"
          @stop="store.stopSync"
          @remove="store.deleteSyncMapping"
        />
        <SyncStatusLog :logs="store.syncLogs" />
      </section>
    </section>
    <PreviewFullscreen :visible="fullscreenVisible" :file="store.previewFile" @close="closeFullscreen" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import ConnectionForm from './components/ConnectionForm.vue';
import ServerList from './components/ServerList.vue';
import RemoteExplorer from './components/RemoteExplorer.vue';
import TerminalPanel from './components/TerminalPanel.vue';
import SyncConfigList from './components/SyncConfigList.vue';
import SyncStatusLog from './components/SyncStatusLog.vue';
import FileEditorModal from './components/FileEditorModal.vue';
import { useMainStore } from './store/mainStore';
import ThemePicker from './components/ThemePicker.vue';
import FilePreview from './components/FilePreview.vue';
import PreviewFullscreen from './components/PreviewFullscreen.vue';

const store = useMainStore();
const showCreateModal = ref(false);
const isDetailView = ref(false);
const editorVisible = ref(false);
const editorMessage = ref('');
const editorMessageType = ref('info');
const editingConnection = ref(null);
const fullscreenVisible = ref(false);

onMounted(async () => {
  await Promise.all([store.loadConnections(), store.loadSyncMappings()]);
  store.listenSyncLog();
  store.initTheme?.();
});

watch(
  () => store.selectedConnectionId,
  (value) => {
    if (!value) {
      isDetailView.value = false;
    }
  },
);

watch(
  () => store.previewFile?.path,
  (value) => {
    if (!value) {
      editorVisible.value = false;
      editorMessage.value = '';
      fullscreenVisible.value = false;
    }
  },
);

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

const currentConnection = computed(() =>
  store.connections.find((item) => item.id === store.selectedConnectionId) || null,
);

const currentHostLabel = computed(() => {
  const c = currentConnection.value;
  if (!c) return '';
  const port = c.port && c.port !== 22 ? `:${c.port}` : '';
  if (c.name) return `${c.name}`;
  if (c.username && c.host) return `${c.username}@${c.host}${port}`;
  return `${c.host || ''}${port}`;
});

function openCreateModal() {
  showCreateModal.value = true;
}

function closeCreateModal() {
  showCreateModal.value = false;
  editingConnection.value = null;
}

function openEditor() {
  if (!store.previewFile) {
    return;
  }
  editorMessage.value = '';
  editorMessageType.value = 'info';
  editorVisible.value = true;
}

function closeEditor() {
  editorVisible.value = false;
  editorMessage.value = '';
}

function openFullscreen() {
  if (!store.previewFile) return;
  fullscreenVisible.value = true;
}

function closeFullscreen() {
  fullscreenVisible.value = false;
}

async function handleCreateConnection(connection) {
  try {
    await store.saveConnection(connection);
    closeCreateModal();
  } catch (error) {
    console.error(error);
  }
}

function handleSelectConnection(id) {
  store.selectedConnectionId = id;
  isDetailView.value = true;
  store.connect(id);
}

function openEditModal(id) {
  const target = store.connections.find((c) => c.id === id);
  if (!target) return;
  editingConnection.value = { ...target };
  showCreateModal.value = true;
}

async function handleDeleteConnection(id) {
  await store.deleteConnection(id);
  if (!store.connections.length) {
    store.connectionStatus = 'idle';
    store.connectionMessage = '';
  }
}

function handleBackToList() {
  isDetailView.value = false;
  store.connectionStatus = 'idle';
  store.connectionMessage = '';
  store.remoteEntries = [];
  store.previewFile = null;
  store.remotePath = '/';
  store.selectedConnectionId = null;
  closeEditor();
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

async function handleSaveFile(content) {
  editorMessageType.value = 'info';
  const result = await store.saveRemoteFile(content);
  if (result.ok) {
    editorMessageType.value = 'success';
    editorMessage.value = '保存成功';
    setTimeout(() => {
      editorMessage.value = '';
      editorVisible.value = false;
    }, 700);
  } else {
    editorMessageType.value = 'error';
    editorMessage.value = result.message || '保存失败';
  }
}

async function handleDeleteFile(payload) {
  // payload: string or { path, isDir, recursive }
  const target = typeof payload === 'string' ? { path: payload, isDir: false } : payload;
  const result = target.isDir ? await store.deleteRemotePath(target) : await store.deleteRemoteFile(target.path);
  if (!result.ok) {
    editorMessageType.value = 'error';
    editorMessage.value = result.message || '删除失败';
  }
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--bg-1), var(--bg-2));
  color: #e2e8f0;
  padding: clamp(24px, 6vw, 60px);
  display: flex;
  flex-direction: column;
  gap: clamp(24px, 4vw, 40px);
}

.landing,
.detail {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.landing__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.landing__header h1 {
  margin: 0 0 6px;
  font-size: clamp(28px, 3vw, 36px);
}

.landing__header p {
  color: #94a3b8;
  margin: 0;
}

.landing__empty {
  padding: 32px;
  border-radius: 16px;
  background: var(--surface-1);
  border: 1px dashed var(--panel-border);
  text-align: center;
  color: #94a3b8;
}

.btn {
  padding: 10px 20px;
  border-radius: 999px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.3s ease;
}

.btn:active {
  transform: scale(0.98);
}

.btn--primary {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
  color: #fff;
  box-shadow: 0 8px 22px var(--accent-glow);
}
.btn--primary:hover,
.btn--primary:focus-visible {
  box-shadow: 0 12px 28px var(--accent-glow);
}

.btn--secondary {
  background: transparent;
  border: 1px solid var(--accent-1);
  color: #cbd5f5;
}

.btn--ghost {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: #e2e8f0;
}

.header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.host-chip {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  color: #e2e8f0;
  font-size: 13px;
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  background: var(--surface-1);
  border-radius: 16px;
  border: 1px solid var(--panel-border);
}

.detail__status {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: center;
}

.detail__status-message {
  color: #f87171;
}

.detail__grid {
  display: grid;
  gap: 16px;
}

.detail__grid--columns {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}

.panel {
  background: var(--surface-1);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--panel-border);
  backdrop-filter: var(--panel-blur);
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}

.preview__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.panel__empty {
  color: #94a3b8;
}

.preview__content {
  white-space: pre-wrap;
  background: var(--surface-2);
  border-radius: 10px;
  padding: 12px;
  font-size: 13px;
}

@media (max-width: 1024px) {
  .landing__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .detail__topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .detail__status {
    justify-content: flex-start;
  }

  .detail__grid--columns {
    grid-template-columns: 1fr;
  }
}
</style>
