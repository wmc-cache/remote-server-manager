<template>
  <section class="panel">
    <header class="panel__header">
      <h2>同步任务</h2>
    </header>
    <form class="form" @submit.prevent="handleSubmit">
      <div class="form__row">
        <label class="form__field">
          <span>本地路径</span>
          <div class="input-group">
            <input v-model="form.localPath" :placeholder="form.kind === 'file' ? '选择本地文件' : '选择本地目录'" />
            <button class="btn btn--ghost" type="button" @click="pickLocal">选择</button>
          </div>
        </label>
        <label class="form__field">
          <span>远程路径</span>
          <input v-model="form.remotePath" required placeholder="/var/www/project 或 /var/www/file.txt" />
        </label>
      </div>
      <div class="form__row">
        <label class="form__field">
          <span>同步模式</span>
          <div class="mode-group">
            <label class="mode-option">
              <input v-model="form.mode" type="radio" value="upload" />
              <span>本地 → 远程</span>
            </label>
            <label class="mode-option">
              <input v-model="form.mode" type="radio" value="bidirectional" />
              <span>双向同步</span>
            </label>
          </div>
        </label>
        <label class="form__field">
          <span>同步对象</span>
          <div class="mode-group">
            <label class="mode-option">
              <input v-model="form.kind" type="radio" value="dir" />
              <span>目录</span>
            </label>
            <label class="mode-option">
              <input v-model="form.kind" type="radio" value="file" />
              <span>文件</span>
            </label>
          </div>
        </label>
        <div class="form__field form__field--actions">
          <button class="btn" type="submit" :disabled="isSyncing">保存配置</button>
        </div>
      </div>
    </form>

    <div v-if="!mappings.length" class="panel__empty">当前没有同步任务</div>
    <ul v-else class="panel__list">
      <li
        v-for="item in mappings"
        :key="item.id"
        :class="['panel__item', isActive(item.id) ? 'panel__item--active' : '']"
      >
        <div class="panel__item-info">
          <strong>{{ item.localPath }}</strong>
          <small>{{ item.remotePath }} · {{ formatMode(item.mode) }} · {{ item.kind === 'file' ? '文件' : '目录' }}</small>
        </div>
        <div class="panel__item-status">
          <span :class="['status-dot', isActive(item.id) ? 'status-dot--on' : '']" />
          <span class="status-label">{{ isActive(item.id) ? '运行中' : '未启动' }}</span>
        </div>
        <div class="panel__item-actions">
          <button class="btn" type="button" :disabled="isActive(item.id)" @click="emit('start', item)">启动</button>
          <button class="btn btn--ghost" type="button" :disabled="!isActive(item.id)" @click="emit('stop', item.id)">停止</button>
          <button class="btn btn--danger" type="button" @click="emit('remove', item.id)">删除</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { reactive } from 'vue';

const props = defineProps({
  mappings: {
    type: Array,
    default: () => [],
  },
  isSyncing: {
    type: Boolean,
    default: false,
  },
  activeIds: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['save', 'start', 'stop', 'remove']);

const defaultForm = () => ({ localPath: '', remotePath: '', mode: 'upload', kind: 'dir' });

const form = reactive(defaultForm());

async function pickLocal() {
  if (form.kind === 'file' && window.api.pickLocalFile) {
    const f = await window.api.pickLocalFile();
    if (f) form.localPath = f;
    return;
  }
  if (window.api.pickLocalFolder) {
    const d = await window.api.pickLocalFolder();
    if (d) form.localPath = d;
  }
}

function handleSubmit() {
  emit('save', { ...form });
  Object.assign(form, defaultForm());
}

function formatMode(mode) {
  return mode === 'bidirectional' ? '双向' : '本地 -> 远程';
}

function isActive(id) {
  return props.activeIds.includes(id);
}
</script>

<style scoped>
.panel {
  background: var(--surface-1);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid var(--panel-border);
  backdrop-filter: var(--panel-blur);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}

.form__field > span {
  color: #94a3b8;
}

.input-group {
  display: flex;
  gap: 8px;
}

input,
select {
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  color: #f8fafc;
  padding: 8px 10px;
  flex: 1;
}

.mode-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--surface-3);
  color: #f8fafc;
}

.mode-option input {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
}

/* reserved style hook */

.btn {
  background: var(--accent-solid);
  border: none;
  color: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.btn--ghost {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.btn--danger {
  background: #dc2626;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel__item {
  padding: 12px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  border: 1px solid transparent;
  transition: transform 0.12s ease, background 0.2s ease;
}
.panel__item:hover { transform: translateY(-1px); }

.panel__item--active {
  border: 1px solid rgba(74, 222, 128, 0.6);
  background: linear-gradient(
    135deg,
    rgba(34, 197, 94, 0.16),
    var(--surface-2)
  );
  box-shadow: 0 6px 18px rgba(34, 197, 94, 0.18);
}

.panel__item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
}

.panel__item-info small {
  color: #94a3b8;
}

.panel__item-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-width: 90px;
  justify-content: flex-start;
}

.status-label {
  font-size: 12px;
  letter-spacing: 0.4px;
  color: rgba(226, 232, 240, 0.8);
}

.status-dot--on + .status-label {
  color: #bbf7d0;
  font-weight: 600;
}

.panel__item-actions {
  display: flex;
  gap: 8px;
}

.panel__empty {
  color: #94a3b8;
}

.status-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.4);
  flex: 0 0 auto;
  margin-right: 6px;
}

.status-dot--on {
  background: #4ade80;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.75);
}
</style>
