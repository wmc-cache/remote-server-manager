<template>
  <Teleport to="body">
    <div v-if="visible && file" class="preview-fullscreen">
      <div class="preview-fullscreen__backdrop" @click="emit('close')"></div>
      <section class="preview-fullscreen__panel">
        <header class="preview-fullscreen__header">
          <div class="title">
            <h2>全屏预览</h2>
            <p :title="file?.path">{{ file?.path }}</p>
          </div>
          <div class="actions">
            <button class="btn btn--ghost" type="button" @click="emit('close')">退出全屏</button>
          </div>
        </header>
        <div class="preview-fullscreen__content">
          <FilePreview :file="file" :fullscreen="true" />
        </div>
      </section>
    </div>
  </Teleport>
  
</template>

<script setup>
import { onBeforeUnmount, watch } from 'vue';
import FilePreview from './FilePreview.vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  file: { type: Object, default: null },
});

const emit = defineEmits(['close']);

function onKeydown(e) {
  if (e.key === 'Escape') emit('close');
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      window.addEventListener('keydown', onKeydown);
    } else {
      window.removeEventListener('keydown', onKeydown);
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.preview-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1250;
}
.preview-fullscreen__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(2px);
}
.preview-fullscreen__panel {
  position: absolute;
  inset: 24px;
  background: var(--surface-1);
  border-radius: 16px;
  border: 1px solid var(--panel-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 22px 55px rgba(15, 23, 42, 0.55);
}
.preview-fullscreen__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--panel-border);
}
.title h2 { margin: 0 0 4px; font-size: 18px; }
.title p { margin: 0; font-size: 12px; color: #94a3b8; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; max-width: 60vw; }
.actions { display: flex; gap: 8px; }
.btn.btn--ghost { background: transparent; border: 1px solid var(--panel-border); color: #e2e8f0; padding: 8px 14px; border-radius: 999px; }
.preview-fullscreen__content { flex: 1; padding: 12px 16px; overflow: auto; }
</style>
