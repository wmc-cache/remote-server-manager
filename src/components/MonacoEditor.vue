<template>
  <div class="monaco-editor">
    <div ref="container" class="editor-host"></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as monaco from 'monaco-editor';
import 'monaco-editor/min/vs/editor/editor.main.css';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

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
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'plaintext' },
  readOnly: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'ready']);

const container = ref(null);
let editorInstance = null;
let fromOuterChange = false;

onMounted(() => {
  editorInstance = monaco.editor.create(container.value, {
    value: props.modelValue || '',
    language: props.language || 'plaintext',
    readOnly: props.readOnly || false,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    fontSize: 13,
  });
  editorInstance.onDidChangeModelContent(() => {
    if (fromOuterChange) { fromOuterChange = false; return; }
    const v = editorInstance.getValue();
    if (v !== props.modelValue) emit('update:modelValue', v);
  });
  emit('ready');
});

watch(
  () => props.modelValue,
  (v) => {
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (model && v !== model.getValue()) {
      fromOuterChange = true;
      model.setValue(v || '');
    }
  },
);

watch(
  () => props.language,
  (lang) => {
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang || 'plaintext');
  },
);

watch(
  () => props.readOnly,
  (ro) => {
    editorInstance?.updateOptions({ readOnly: !!ro });
  },
);

onBeforeUnmount(() => {
  try { editorInstance?.dispose(); } catch (_) {}
});
</script>

<style scoped>
.monaco-editor .editor-host {
  height: 60vh;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
}
</style>

