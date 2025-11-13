<template>
  <section class="panel terminal-panel">
    <header class="panel__header"><h2>远程命令行</h2></header>
    <div class="terminal__screen">
      <div ref="historyEl" class="terminal__history scroll-area">
        <template v-for="item in orderedHistory" :key="item.timestamp">
          <div class="terminal__line">
            <span class="terminal__prompt">$</span>
            <span class="terminal__command">{{ item.command }}</span>
            <small class="terminal__meta">{{ formatTime(item.timestamp) }} · 退出码 {{ item.code }}</small>
          </div>
          <pre v-if="item.stdout" class="terminal__stdout">{{ item.stdout }}</pre>
          <pre v-if="item.stderr" class="terminal__stderr">{{ item.stderr }}</pre>
        </template>
      </div>
      <form class="terminal__form" @submit.prevent="handleExecute">
        <span class="terminal__prompt">$</span>
        <input v-model="command" placeholder="输入要执行的命令，例如 ls -al" />
        <button class="btn btn--ghost" type="submit">执行</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
// typing效果已在 store 层通过逐字符更新实现

const props = defineProps({
  history: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['execute']);

const command = ref('');
const historyEl = ref(null);

const orderedHistory = computed(() => {
  return [...(props.history || [])].reverse();
});

watch(
  () => props.history?.length,
  async () => {
    await nextTick();
    try {
      historyEl.value?.scrollTo({ top: historyEl.value.scrollHeight, behavior: 'smooth' });
    } catch (_) {}
  },
);

// 深度监听，用于流式追加时自动滚动
watch(
  () => props.history,
  async () => {
    await nextTick();
    try {
      historyEl.value?.scrollTo({ top: historyEl.value.scrollHeight });
    } catch (_) {}
  },
  { deep: true },
);

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
.panel { background: var(--surface-1); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px; height: 100%; border: 1px solid var(--panel-border); backdrop-filter: var(--panel-blur); }

.terminal-panel { padding: 16px; }

.terminal__screen {
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  border-radius: 12px;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.terminal__history { max-height: 260px; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }

.terminal__line { display: flex; align-items: baseline; gap: 8px; }
.terminal__prompt { color: #22c55e; }
.terminal__command { color: #e2e8f0; font-weight: 500; }
.terminal__meta { color: #64748b; margin-left: auto; font-size: 12px; }

.terminal__stdout { white-space: pre-wrap; color: #d1fae5; font-size: 13px; margin: 0 0 8px 20px; }
.terminal__stderr { white-space: pre-wrap; color: #f87171; font-size: 13px; margin: 0 0 8px 20px; }

.terminal__form { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--panel-border); background: var(--surface-2); }
.terminal__form input { flex: 1; background: transparent; border: none; outline: none; color: #e2e8f0; padding: 6px 0; font-family: inherit; font-size: 13px; }

.btn { background: var(--accent-solid); border: none; color: #fff; border-radius: 8px; padding: 8px 16px; }
.btn.btn--ghost { background: transparent; border: 1px solid var(--panel-border); color: #e2e8f0; }
.terminal__entry { display: contents; }
</style>
