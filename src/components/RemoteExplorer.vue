<template>
  <section class="panel">
    <header class="panel__header">
      <h2>远程文件浏览</h2>
      <button class="btn" type="button" @click="emit('refresh', currentPath)">刷新</button>
    </header>
    <div class="path-bar">
      <input v-model="editablePath" @keyup.enter="emitPath" />
      <button class="btn btn--ghost" type="button" @click="goUp">上一级</button>
    </div>
    <div v-if="loading" class="panel__empty">加载中...</div>
    <div v-else class="explorer scroll-area">
      <div
        v-for="entry in entries"
        :key="entry.filename"
        class="explorer__item"
        @dblclick="handleOpen(entry)"
      >
        <div class="explorer__meta">
          <span class="explorer__icon">{{ entry.attrs?.isDirectory ? '📁' : '📄' }}</span>
          <span class="explorer__name">{{ entry.filename }}</span>
        </div>
        <div class="explorer__actions">
          <button v-if="!entry.attrs?.isDirectory" class="btn btn--ghost" type="button" @click="emit('preview', composePath(entry.filename))">
            预览
          </button>
          <button
            v-if="!entry.attrs?.isDirectory"
            class="btn btn--ghost"
            type="button"
            title="下载到本地"
            @click.stop="emit('download', composePath(entry.filename))"
          >
            下载
          </button>
          <button
            v-if="!entry.attrs?.isDirectory"
            class="btn btn--ghost btn--danger"
            type="button"
            title="删除文件"
            @click="confirmDelete(entry)"
          >
            删除
          </button>
          <button
            v-if="entry.attrs?.isDirectory"
            class="btn btn--ghost btn--danger"
            type="button"
            title="删除文件夹"
            @click="confirmDelete(entry)"
          >
            删除
          </button>
          <span class="explorer__size">{{ formatSize(entry.attrs?.size) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  entries: {
    type: Array,
    default: () => [],
  },
  currentPath: {
    type: String,
    default: '/',
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['changePath', 'refresh', 'preview', 'download', 'delete']);

const editablePath = ref(props.currentPath);

watch(
  () => props.currentPath,
  (value) => {
    editablePath.value = value;
  },
);

const normalizedCurrent = computed(() => (props.currentPath || '/').replace(/\/+$/, '') || '/');

function composePath(name) {
  const base = normalizedCurrent.value === '/' ? '' : normalizedCurrent.value;
  return `${base}/${name}`.replace(/\/+/g, '/');
}

function goUp() {
  if (normalizedCurrent.value === '/' || !normalizedCurrent.value) {
    return;
  }
  const segments = normalizedCurrent.value.split('/').filter(Boolean);
  segments.pop();
  const next = `/${segments.join('/')}` || '/';
  emit('changePath', next);
}

function handleOpen(entry) {
  if (entry.attrs?.isDirectory) {
    emit('changePath', composePath(entry.filename));
  } else {
    emit('preview', composePath(entry.filename));
  }
}

function formatSize(size) {
  if (!size && size !== 0) {
    return '';
  }
  if (size < 1024) {
    return `${size}B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)}KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function emitPath() {
  emit('changePath', editablePath.value || '/');
}

function confirmDelete(entry) {
  const path = composePath(entry.filename);
  const isDir = !!entry.attrs?.isDirectory;
  // eslint-disable-next-line no-alert
  const ok = window.confirm(isDir ? `确认删除文件夹（含所有内容）：${path} ？` : `确认删除文件：${path} ？`);
  if (!ok) return;
  emit('delete', { path, isDir, recursive: true });
}
</script>

<style scoped>
.panel {
  background: var(--surface-1);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 320px;
  border: 1px solid var(--panel-border);
  backdrop-filter: var(--panel-blur);
}

.panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel__empty {
  color: #94a3b8;
}

.path-bar {
  display: flex;
  gap: 8px;
}

.path-bar input {
  flex: 1;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  color: #f8fafc;
  padding: 8px 10px;
}

.explorer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
}

.explorer__item {
  background: var(--surface-2);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: transform 0.12s ease, background 0.2s ease;
}
.explorer__item:hover { transform: translateY(-1px); }

.explorer__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.explorer__name {
  font-weight: 600;
}

.explorer__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  /* fixed width to align action buttons and size across rows */
  width: 280px;
  justify-content: flex-end;
}

.explorer__size {
  color: #94a3b8;
  font-size: 12px;
  width: 60px;
  text-align: right;
  white-space: nowrap;
}

.btn {
  background: var(--surface-3);
  border: none;
  color: #e2e8f0;
  border-radius: 999px;
  padding: 4px 10px;
}

.btn--ghost {
  background: transparent;
  border: 1px solid var(--panel-border);
}

.btn--danger {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.5);
}
</style>
