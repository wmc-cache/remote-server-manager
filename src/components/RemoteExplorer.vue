<template>
  <section class="panel">
    <header class="panel__header">
      <h2>远程文件浏览</h2>
      <button class="btn" type="button" @click="emit('refresh', currentPath)">刷新</button>
    </header>
    <div class="path-bar">
      <FancySearchInput
        v-model="editablePath"
        :placeholder="currentPath || '/'"
        :full="true"
        @enter="emitPath"
        @action="goUp"
        style="flex: 1; min-width: 0"
      />
    </div>
    <div v-if="loading" class="panel__empty">加载中...</div>
    <div v-else ref="listEl" class="explorer scroll-area" @scroll="handleScroll">
      <div class="explorer__spacer" :style="{ height: `${totalHeight}px` }">
        <div
          v-for="(entry, index) in visibleEntries"
          :key="entry.filename"
          class="explorer__item"
          :style="{ transform: `translate3d(0, ${(startIndex + index) * rowHeight}px, 0)` }"
          @dblclick="handleOpen(entry)"
        >
          <div class="explorer__meta">
            <span class="explorer__icon">{{ entry.attrs?.isDirectory ? '📁' : '📄' }}</span>
            <span class="explorer__name" :title="entry.filename">{{ entry.filename }}</span>
          </div>
          <div class="explorer__actions">
            <button
              v-if="!entry.attrs?.isDirectory"
              class="btn btn--ghost"
              type="button"
              @click.stop="emit('preview', composePath(entry.filename))"
            >
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
              @click.stop="confirmDelete(entry)"
            >
              删除
            </button>
            <button
              v-if="entry.attrs?.isDirectory"
              class="btn btn--ghost btn--danger"
              type="button"
              title="删除文件夹"
              @click.stop="confirmDelete(entry)"
            >
              删除
            </button>
            <span class="explorer__size">{{ formatSize(entry.attrs?.size) }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import FancySearchInput from './FancySearchInput.vue';

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
const listEl = ref(null);
const scrollTop = ref(0);
const viewportHeight = ref(280);

const itemHeight = 48;
const itemGap = 6;
const rowHeight = itemHeight + itemGap;
const overscan = 10;

let resizeObserver = null;
let scrollRaf = 0;
let pendingScrollTop = 0;

watch(
  () => props.currentPath,
  (value) => {
    editablePath.value = value;
    nextTick(() => {
      resetScroll();
    });
  },
);

const normalizedCurrent = computed(() => (props.currentPath || '/').replace(/\/+$/, '') || '/');

const totalHeight = computed(() => (props.entries?.length || 0) * rowHeight);

const startIndex = computed(() => {
  const raw = Math.floor(scrollTop.value / rowHeight) - overscan;
  return Math.max(0, raw);
});

const endIndex = computed(() => {
  const raw = Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight) + overscan;
  return Math.min(props.entries.length, raw);
});

const visibleEntries = computed(() => {
  if (!props.entries?.length) return [];
  return props.entries.slice(startIndex.value, endIndex.value);
});

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

function handleScroll() {
  const el = listEl.value;
  if (!el) return;
  pendingScrollTop = el.scrollTop;
  if (scrollRaf) return;
  scrollRaf = window.requestAnimationFrame(() => {
    scrollTop.value = pendingScrollTop;
    scrollRaf = 0;
  });
}

function resetScroll() {
  const el = listEl.value;
  if (el) el.scrollTop = 0;
  scrollTop.value = 0;
}

function updateViewportHeight() {
  const el = listEl.value;
  if (!el) return;
  viewportHeight.value = el.clientHeight || 280;
}

onMounted(() => {
  updateViewportHeight();
  if (window.ResizeObserver) {
    resizeObserver = new window.ResizeObserver(() => updateViewportHeight());
    if (listEl.value) resizeObserver.observe(listEl.value);
  } else {
    window.addEventListener('resize', updateViewportHeight);
  }
});

onUnmounted(() => {
  if (scrollRaf) {
    window.cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
  }
  if (resizeObserver) {
    try {
      resizeObserver.disconnect();
    } catch (_) {}
    resizeObserver = null;
  } else {
    window.removeEventListener('resize', updateViewportHeight);
  }
});
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
  position: relative;
  max-height: 280px;
}

.explorer__spacer {
  position: relative;
}

.explorer__item {
  background: var(--surface-2);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: absolute;
  left: 0;
  right: 0;
  height: 48px;
  overflow: hidden;
  will-change: transform;
  transition: background 0.2s ease;
}
.explorer__item:hover { background: rgba(56, 189, 248, 0.08); }

.explorer__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.explorer__name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
