<template>
  <div class="theme-picker">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="swatch"
      :style="{ background: `linear-gradient(135deg, ${opt.c1}, ${opt.c2})` }"
      :title="opt.label"
      @click="pick(opt.value)"
    />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';

const emit = defineEmits(['change']);

const options = [
  { value: 'theme-sky', label: '天蓝', c1: '#2563eb', c2: '#38bdf8' },
  { value: 'theme-violet', label: '紫罗兰', c1: '#7c3aed', c2: '#a78bfa' },
  { value: 'theme-emerald', label: '祖母绿', c1: '#10b981', c2: '#34d399' },
  { value: 'theme-rose', label: '玫瑰', c1: '#e11d48', c2: '#fb7185' },
  { value: 'theme-amber', label: '琥珀', c1: '#f59e0b', c2: '#fbbf24' },
];

function pick(value) {
  emit('change', value);
}

onMounted(() => {
  // noop; actual theme is applied by store.initTheme()
});
</script>

<style scoped>
.theme-picker {
  display: inline-flex;
  gap: 6px;
}
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(148, 163, 184, 0.4);
  cursor: pointer;
}
.swatch:active { transform: scale(0.96); }
</style>

