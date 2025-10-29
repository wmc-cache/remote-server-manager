<template>
  <section class="panel">
    <header class="panel__header">
      <h2>服务器列表</h2>
    </header>
    <div v-if="!connections.length" class="panel__empty">暂无已保存的服务器配置</div>
    <ul v-else class="panel__list">
      <li
        v-for="item in connections"
        :key="item.id"
        :class="['panel__item', selected === item.id ? 'panel__item--active' : '']"
      >
        <div class="panel__item-info">
          <strong>{{ item.name || item.host }}</strong>
          <small>{{ item.username }}@{{ item.host }}:{{ item.port || 22 }}</small>
        </div>
        <div class="panel__item-actions">
          <button type="button" class="btn" @click="emit('select', item.id)">连接</button>
          <button type="button" class="btn btn--danger" @click="emit('delete', item.id)">删除</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
const props = defineProps({
  connections: {
    type: Array,
    required: true,
  },
  selected: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(['select', 'delete']);
</script>

<style scoped>
.panel {
  background: rgba(15, 23, 42, 0.75);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel__empty {
  color: #94a3b8;
  font-size: 14px;
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
  align-items: center;
  gap: 12px;
}

.panel__item--active {
  border: 1px solid #38bdf8;
}

.panel__item-info {
  display: flex;
  flex-direction: column;
}

.panel__item-info small {
  color: #94a3b8;
}

.panel__item-actions {
  display: flex;
  gap: 8px;
}

.btn {
  background: #1d4ed8;
  border: none;
  border-radius: 6px;
  color: #fff;
  padding: 6px 12px;
}

.btn--danger {
  background: #dc2626;
}
</style>
