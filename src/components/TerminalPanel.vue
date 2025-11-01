<template>
  <section class="panel">
    <header class="panel__header">
      <h2>远程命令行</h2>
    </header>
    <form class="terminal__form" @submit.prevent="handleExecute">
      <input v-model="command" placeholder="输入要执行的命令，例如 ls -al" />
      <button class="btn" type="submit">执行</button>
    </form>
    <div class="terminal__history scroll-area">
      <article v-for="item in history" :key="item.timestamp" class="terminal__entry">
        <header>
          <span class="terminal__command">$ {{ item.command }}</span>
          <small>{{ formatTime(item.timestamp) }} · 退出码 {{ item.code }}</small>
        </header>
        <pre v-if="item.stdout" class="terminal__stdout">{{ item.stdout }}</pre>
        <pre v-if="item.stderr" class="terminal__stderr">{{ item.stderr }}</pre>
      </article>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  history: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['execute']);

const command = ref('');

function handleExecute() {
  if (!command.value.trim()) {
    return;
  }
  emit('execute', command.value.trim());
  command.value = '';
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
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
  height: 100%;
  border: 1px solid var(--panel-border);
  backdrop-filter: var(--panel-blur);
}

.terminal__form {
  display: flex;
  gap: 10px;
}

.terminal__form input {
  flex: 1;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  color: #f8fafc;
  padding: 8px 10px;
}

.btn {
  background: var(--accent-solid);
  border: none;
  color: #fff;
  border-radius: 8px;
  padding: 8px 16px;
}

.terminal__history {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 240px;
}

.terminal__entry {
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.terminal__command {
  font-weight: 600;
}

.terminal__stdout {
  white-space: pre-wrap;
  color: #22d3ee;
  font-size: 13px;
}

.terminal__stderr {
  white-space: pre-wrap;
  color: #f87171;
  font-size: 13px;
}
</style>
