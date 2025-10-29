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
      <button class="server-list__delete" type="button" @click.stop="emit('delete', item.id)">删除</button>
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

const emit = defineEmits(['select', 'delete']);
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
  background: rgba(15, 23, 42, 0.75);
  border-radius: 14px;
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
  border-color: rgba(56, 189, 248, 0.6);
  transform: translateY(-2px);
}

.server-list__item--active {
  border-color: #38bdf8;
}

.server-list__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.server-list__meta small {
  color: #94a3b8;
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
