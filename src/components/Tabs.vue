<template>
  <div class="tabs">
    <div class="tabs__header">
      <div
        v-for="(tab, index) in tabs"
        :key="index"
        class="tab-item"
        :class="{ 'tab-item--active': modelValue === index }"
        @click="$emit('update:modelValue', index)"
      >
        <component v-if="tab.icon" :is="tab.icon" class="tab-icon" />
        <span>{{ tab.label }}</span>
      </div>
    </div>
    <div class="tabs__content">
      <slot :activeTab="modelValue" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Number,
    default: 0,
  },
  tabs: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['update:modelValue']);
</script>

<style scoped>
.tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tabs__header {
  display: flex;
  gap: 8px;
  padding: 16px 16px 0;
  border-bottom: 1px solid var(--panel-border);
  flex-shrink: 0;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  margin-bottom: -1px;
  transition: all 0.2s;
  position: relative;
  user-select: none;
  color: #94a3b8;
  font-size: 14px;
}

.tab-item:hover {
  background: rgba(59, 130, 246, 0.1);
  color: #e2e8f0;
}

.tab-item--active {
  color: #e2e8f0;
  background: var(--surface-1);
  border: 1px solid var(--panel-border);
  border-bottom: 1px solid var(--surface-1);
}

.tab-item--active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent-1);
  border-radius: 2px 2px 0 0;
}

.tab-icon {
  width: 16px;
  height: 16px;
}

.tabs__content {
  flex: 1;
  overflow: hidden;
}
</style>
