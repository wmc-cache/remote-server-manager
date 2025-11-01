<template>
  <Teleport to="body">
    <div v-if="visible" class="modal">
      <div class="modal__backdrop" @click="emit('close')"></div>
      <section class="modal__dialog">
        <header class="modal__header">
          <div class="modal__title">
            <h2>编辑文件</h2>
            <p>{{ file?.path }}</p>
          </div>
          <button type="button" class="modal__close" @click="emit('close')">×</button>
        </header>
        <textarea
          v-model="localContent"
          class="modal__textarea"
          spellcheck="false"
          rows="18"
        ></textarea>
        <footer class="modal__footer">
          <span v-if="message" :class="['modal__message', `modal__message--${messageType}`]">
            {{ message }}
          </span>
          <div class="modal__actions">
            <button class="btn btn--ghost" type="button" @click="emit('close')">取消</button>
            <button class="btn" type="button" :disabled="saving" @click="handleSave">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  file: {
    type: Object,
    default: null,
  },
  saving: {
    type: Boolean,
    default: false,
  },
  message: {
    type: String,
    default: '',
  },
  messageType: {
    type: String,
    default: 'info',
  },
});

const emit = defineEmits(['close', 'save']);

const localContent = ref('');

watch(
  () => props.visible,
  (value) => {
    if (value && props.file) {
      localContent.value = props.file.content ?? '';
    }
  },
);

watch(
  () => props.file,
  (file) => {
    if (props.visible && file) {
      localContent.value = file.content ?? '';
    }
  },
  { deep: true },
);

function handleSave() {
  emit('save', localContent.value);
}
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
}

.modal__dialog {
  position: relative;
  width: min(960px, 90vw);
  max-height: 90vh;
  background: var(--surface-1);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid var(--panel-border);
  box-shadow: 0 22px 55px rgba(15, 23, 42, 0.55);
  backdrop-filter: var(--panel-blur);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.modal__title h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.modal__title p {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  word-break: break-all;
}

.modal__close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

.modal__textarea {
  width: 100%;
  flex: 1;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  color: #f8fafc;
  padding: 14px;
  font-family: 'Fira Code', 'Consolas', 'Courier New', monospace;
  resize: vertical;
  min-height: 300px;
}

.modal__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.modal__message {
  font-size: 13px;
}

.modal__message--success {
  color: #4ade80;
}

.modal__message--error {
  color: #f87171;
}

.modal__actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.btn[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--ghost {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: #e2e8f0;
}

.btn {
  /* accent variables consumed above */
}
</style>
