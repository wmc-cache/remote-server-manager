<template>
  <Teleport to="body">
    <div v-if="visible" class="modal">
      <div class="modal__backdrop" @click="emit('close')"></div>
      <section :class="['modal__dialog', { 'modal__dialog--fullscreen': fullscreen }]">
        <header class="modal__header">
          <div class="modal__title">
            <h2>编辑文件</h2>
            <p>{{ file?.path }}</p>
          </div>
          <div class="modal__actions">
            <button class="btn btn--ghost" type="button" @click="toggleFullscreen">
              {{ fullscreen ? '退出全屏' : '全屏' }}
            </button>
            <button type="button" class="modal__close" @click="emit('close')">×</button>
          </div>
        </header>
        <MonacoEditor
          v-model="localContent"
          :language="monacoLanguage"
          :read-only="false"
        />
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
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import MonacoEditor from './MonacoEditor.vue';

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
const fullscreen = ref(false);

const monacoLanguage = computed(() => {
  const path = props.file?.path || '';
  const e = (path.split('.').pop() || '').toLowerCase();
  const map = {
    js: 'javascript', cjs: 'javascript', mjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html',
    md: 'markdown', markdown: 'markdown',
    vue: 'html',
    yml: 'yaml', yaml: 'yaml',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    py: 'python', java: 'java', go: 'go', rs: 'rust',
    cpp: 'cpp', cxx: 'cpp', cc: 'cpp', c: 'c',
    php: 'php', rb: 'ruby', kt: 'kotlin', kts: 'kotlin',
    sql: 'sql', toml: 'toml', ini: 'ini', cfg: 'ini',
    xml: 'xml',
    dockerfile: 'dockerfile', docker: 'dockerfile',
    ps1: 'powershell',
    swift: 'swift', scala: 'scala', r: 'r', perl: 'perl', pl: 'perl',
  };
  return map[e] || 'plaintext';
});

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

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value;
  document.body.style.overflow = fullscreen.value ? 'hidden' : '';
}

onBeforeUnmount(() => {
  document.body.style.overflow = '';
});

// 关闭弹窗时确保退出全屏并恢复滚动
watch(
  () => props.visible,
  (v) => {
    if (!v) {
      fullscreen.value = false;
      document.body.style.overflow = '';
    }
  },
);
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

.modal__actions { display: flex; gap: 8px; align-items: center; }

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

.modal__textarea { display: none; }

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

.modal__dialog--fullscreen {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  max-height: none;
  border-radius: 0;
  padding: 16px;
}
.modal__dialog--fullscreen :deep(.editor-host) {
  height: calc(100vh - 160px);
}
</style>
