<template>
  <ul class="server-list">
    <li
      v-for="item in connections"
      :key="item.id"
      :class="['server-list__item', selected === item.id ? 'server-list__item--active' : '']"
      @click="emit('select', item.id)"
    >
      <div class="server-list__meta">
        <strong>{{ item.name || item.host }}</strong>
        <small>{{ item.username }}@{{ item.host }}:{{ item.port || 22 }}</small>
      </div>
      <div class="server-list__actions">
        <button class="server-list__edit" type="button" @click.stop="emit('edit', item.id)">编辑</button>
        <button class="server-list__delete" type="button" @click.stop="emit('delete', item.id)">删除</button>
      </div>
    </li>
  </ul>
</template>

<script setup>
defineProps({
  connections: {
    type: Array,
    required: true,
  },
  selected: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(['select', 'delete', 'edit']);
</script>

<style scoped>
.server-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.server-list__item {
  background: var(--surface-1);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 1px solid transparent;
  transition: border 0.2s ease, transform 0.2s ease;
  cursor: pointer;
}

.server-list__item:hover {
  border-color: var(--accent-2);
  transform: translateY(-2px);
}

.server-list__item--active {
  border-color: var(--accent-2);
}

.server-list__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.server-list__meta small {
  color: #94a3b8;
}

.server-list__actions { display: flex; gap: 8px; }

.server-list__edit {
  background: transparent;
  border: 1px solid var(--accent-1);
  border-radius: 999px;
  color: #cbd5f5;
  padding: 6px 14px;
  cursor: pointer;
}

.server-list__delete {
  background: transparent;
  border: 1px solid rgba(248, 113, 113, 0.6);
  border-radius: 999px;
  color: #fca5a5;
  padding: 6px 14px;
  cursor: pointer;
}
</style>
