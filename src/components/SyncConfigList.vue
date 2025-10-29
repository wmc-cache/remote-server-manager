<template>
  <section class="panel">
    <header class="panel__header">
      <h2>同步任务</h2>
    </header>
    <form class="form" @submit.prevent="handleSubmit">
      <div class="form__row">
        <label class="form__field">
          <span>本地目录</span>
          <div class="input-group">
            <input v-model="form.localPath" placeholder="选择本地目录" />
            <button class="btn btn--ghost" type="button" @click="pickLocal">选择</button>
          </div>
        </label>
        <label class="form__field">
          <span>远程目录</span>
          <input v-model="form.remotePath" required placeholder="/var/www/project" />
        </label>
      </div>
      <div class="form__row">
        <label class="form__field">
          <span>同步模式</span>
          <select v-model="form.mode">
            <option value="upload">本地 -> 远程</option>
            <option value="bidirectional">双向 (实验)</option>
          </select>
        </label>
        <div class="form__field form__field--actions">
          <button class="btn" type="submit" :disabled="isSyncing">保存配置</button>
        </div>
      </div>
    </form>

    <div v-if="!mappings.length" class="panel__empty">当前没有同步任务</div>
    <ul v-else class="panel__list">
      <li v-for="item in mappings" :key="item.id" class="panel__item">
        <div class="panel__item-info">
          <strong>{{ item.localPath }}</strong>
          <small>{{ item.remotePath }} · {{ formatMode(item.mode) }}</small>
        </div>
        <div class="panel__item-actions">
          <button class="btn" type="button" @click="emit('start', item)">启动</button>
          <button class="btn btn--ghost" type="button" @click="emit('stop', item.id)">停止</button>
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
});

const emit = defineEmits(['save', 'start', 'stop', 'remove']);

const form = reactive({
  localPath: '',
  remotePath: '',
  mode: 'upload',
});

async function pickLocal() {
  if (!window.api.pickLocalFolder) {
    return;
  }
  const result = await window.api.pickLocalFolder();
  if (result) {
    form.localPath = result;
  }
}

function handleSubmit() {
  emit('save', { ...form });
  form.remotePath = '';
}

function formatMode(mode) {
  return mode === 'bidirectional' ? '双向' : '本地 -> 远程';
}
</script>

<style scoped>
.panel {
  background: rgba(15, 23, 42, 0.75);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(30, 41, 59, 0.8);
  color: #f8fafc;
  padding: 8px 10px;
  flex: 1;
}

.btn {
  background: #2563eb;
  border: none;
  color: #fff;
  border-radius: 8px;
  padding: 8px 12px;
}

.btn--ghost {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.btn--danger {
  background: #dc2626;
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
  background: rgba(30, 41, 59, 0.8);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.panel__item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel__item-info small {
  color: #94a3b8;
}

.panel__item-actions {
  display: flex;
  gap: 8px;
}

.panel__empty {
  color: #94a3b8;
}
</style>
