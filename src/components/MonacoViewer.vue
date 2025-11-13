<template>
  <div class="monaco-view" :class="{ 'is-fullscreen': fullscreen }">
    <div ref="container" class="editor-host"></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
// ESM 方式加载 Monaco 以及样式和 workers（Vite 友好）
import * as monaco from 'monaco-editor';
import 'monaco-editor/min/vs/editor/editor.main.css';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// 仅初始化一次 Worker 路由
if (typeof window !== 'undefined' && !window.__MONACO_WORKER_SETUP__) {
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new JsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
      if (label === 'typescript' || label === 'javascript') return new TsWorker();
      return new EditorWorker();
    },
  };
  window.__MONACO_WORKER_SETUP__ = true;
}

const props = defineProps({
  value: { type: String, default: '' },
  language: { type: String, default: 'plaintext' },
  readOnly: { type: Boolean, default: true },
  fullscreen: { type: Boolean, default: false },
});

const container = ref(null);
let editorInstance = null;

onMounted(() => {
  editorInstance = monaco.editor.create(container.value, {
    value: props.value || '',
    language: props.language || 'plaintext',
    readOnly: props.readOnly !== false,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    renderWhitespace: 'none',
    fontSize: 13,
  });
});

watch(
  () => props.value,
  (v) => {
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (model && v !== model.getValue()) {
      model.setValue(v || '');
    }
  },
);

watch(
  () => props.language,
  (lang) => {
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, lang || 'plaintext');
    }
  },
);

onBeforeUnmount(() => {
  try { editorInstance?.dispose(); } catch (_) {}
});
</script>

<style scoped>
.monaco-view .editor-host {
  height: 70vh;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
}
.monaco-view.is-fullscreen .editor-host { height: 85vh; }
</style>
