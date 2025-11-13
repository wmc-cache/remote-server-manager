<template>
  <span>{{ display }}</span>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  text: { type: String, default: '' },
  playing: { type: Boolean, default: false },
  speed: { type: Number, default: 80 }, // characters per second
});

const display = ref('');
let timer = null;
let index = 0;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function syncToEnd() {
  index = (props.text || '').length;
  display.value = props.text || '';
}

function start() {
  stop();
  const full = props.text || '';
  if (!props.playing) {
    syncToEnd();
    return;
  }
  // keep current index if new text appended; clamp to new length
  if (index > full.length) index = full.length;
  const perTick = Math.max(1, Math.round((props.speed || 80) / 30)); // ~33ms tick
  timer = setInterval(() => {
    const targetLen = (props.text || '').length;
    if (index < targetLen) {
      index += perTick;
      if (index > targetLen) index = targetLen;
      display.value = (props.text || '').slice(0, index);
    } else if (!props.playing) {
      // finished and not playing anymore
      stop();
    }
  }, 33);
}

watch(
  () => [props.text, props.playing],
  () => {
    // if text shrinks (shouldn't), snap to full
    if ((display.value || '').length > (props.text || '').length) {
      syncToEnd();
    }
    start();
  },
  { immediate: true },
);

onBeforeUnmount(() => stop());
</script>

<style scoped>
/* No extra styles; inherits from parent (pre) */
</style>

