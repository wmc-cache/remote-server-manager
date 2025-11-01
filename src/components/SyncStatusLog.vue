<template>
  <section class="panel">
    <header class="panel__header">
      <h2>同步状态</h2>
    </header>
    <div v-if="!logs.length" class="panel__empty">暂无同步日志</div>
    <ul v-else class="log-list scroll-area">
      <li v-for="item in logs" :key="item.timestamp + item.message" :class="['log-entry', `log-entry--${item.level || 'info'}`]">
        <time>{{ formatTime(item.timestamp) }}</time>
        <span>{{ item.message }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup>
const props = defineProps({
  logs: {
    type: Array,
    default: () => [],
  },
});

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString() : '';
}
</script>

<style scoped>
.panel {
  background: var(--surface-1);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 340px;
}

.log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-entry {
  display: flex;
  gap: 12px;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
}

.log-entry--error {
  border: 1px solid rgba(248, 113, 113, 0.6);
}

.log-entry--warn {
  border: 1px solid rgba(250, 204, 21, 0.6);
}

time {
  color: #94a3b8;
  flex: 0 0 90px;
}
</style>
