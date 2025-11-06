<template>
  <div class="file-preview" :class="{ 'is-fullscreen': fullscreen }">
    <!-- 空状态保护 -->
    <div v-if="!file || !file.path" class="empty">暂无可预览文件</div>

    <!-- 图片 -->
    <img
      v-else-if="type === 'image'"
      class="preview-media"
      :src="dataUrl"
      :alt="fileName"
    />

    <!-- 音频 -->
    <audio v-else-if="type === 'audio'" class="preview-media" controls :src="dataUrl" />

    <!-- 视频 -->
    <video v-else-if="type === 'video'" class="preview-media" controls :src="dataUrl" />

    <!-- PDF -->
    <VuePdf v-else-if="type === 'pdf'" :pdf="pdfSource" style="height: 100%; width: 100%" />

    <!-- DOCX -->
    <VueOfficeDocx v-else-if="type === 'docx'" :src="arrayBuffer" class="docx-wrap" />

    <!-- Excel -->
    <VueOfficeExcel v-else-if="type === 'excel'" :src="arrayBuffer" class="excel-wrap" />

    <!-- Markdown -->
    <div v-else-if="type === 'markdown'" class="markdown-body" v-html="renderedMarkdown" />

    <!-- 纯文本/代码 -->
    <pre v-else-if="type === 'text'" class="code"><code v-html="highlightedText"></code></pre>

    <!-- 兜底提示 -->
    <div v-else class="empty">暂不支持此类型预览：{{ ext }}</div>
  </div>
  
</template>

<script setup>
import { computed } from 'vue';
import VuePdf from '@tato30/vue-pdf';
import VueOfficeDocx from '@vue-office/docx';
import VueOfficeExcel from '@vue-office/excel';
import 'highlight.js/styles/github-dark.css';
import '@vue-office/docx/lib/index.css';
import '@vue-office/excel/lib/index.css';
import hljs from 'highlight.js';
import { marked } from 'marked';

const props = defineProps({
  file: {
    type: Object,
    default: null,
  },
  fullscreen: {
    type: Boolean,
    default: false,
  },
});

const file = computed(() => props.file || null);
const fileName = computed(() => file.value?.path?.split('/')?.pop() || '');
const ext = computed(() => (file.value?.path?.split('.').pop() || '').toLowerCase());

const type = computed(() => {
  const e = ext.value;
  if (!e) return 'unknown';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return 'image';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(e)) return 'audio';
  if (['mp4', 'webm', 'mov'].includes(e)) return 'video';
  if (e === 'pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (e === 'xlsx') return 'excel';
  if (['md', 'markdown'].includes(e)) return 'markdown';
  return 'text';
});

// base64 -> dataURL
const mimeMap = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const base64 = computed(() => (file.value?.encoding === 'base64' ? file.value?.content || '' : ''));

const dataUrl = computed(() => {
  const e = ext.value;
  if (!base64.value) return '';
  const mime = mimeMap[e] || 'application/octet-stream';
  return `data:${mime};base64,${base64.value}`;
});

const pdfSource = computed(() => {
  if (type.value !== 'pdf' || !base64.value) return null;
  // vue-pdf 支持 Uint8Array
  const binary = atob(base64.value);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
});

const arrayBuffer = computed(() => {
  if (!base64.value) return null;
  const binary = atob(base64.value);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
});

// 文本/Markdown 渲染
const textContent = computed(() => (file.value?.encoding === 'text' ? file.value?.content || '' : ''));

function escapeHtml(html) {
  return (html || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
});
// 禁用原始 HTML 的直通渲染，做最小逃逸
marked.use({ renderer: { html: (html) => escapeHtml(html) } });

const renderedMarkdown = computed(() => {
  if (type.value !== 'markdown') return '';
  return marked.parse(textContent.value || '');
});

const highlightedText = computed(() => {
  if (type.value !== 'text') return '';
  const e = ext.value;
  const langGuess = {
    js: 'javascript', cjs: 'javascript', mjs: 'javascript', ts: 'typescript',
    json: 'json', yml: 'yaml', yaml: 'yaml', sh: 'bash', bash: 'bash', zsh: 'bash',
    py: 'python', java: 'java', go: 'go', rs: 'rust', cpp: 'cpp', cxx: 'cpp', cc: 'cpp', c: 'c',
    html: 'xml', xml: 'xml', css: 'css', scss: 'scss', md: 'markdown',
    vue: 'xml'
  }[e];
  const code = textContent.value || '';
  try {
    if (langGuess && hljs.getLanguage(langGuess)) {
      return hljs.highlight(code, { language: langGuess }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch (_) {
    return (code || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  }
});
</script>

<style scoped>
.file-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}
.empty { color: #94a3b8; }
.preview-media { max-width: 100%; max-height: 70vh; border-radius: 8px; }
.docx-wrap, .excel-wrap { height: 70vh; overflow: auto; }
.markdown-body { line-height: 1.6; font-size: 14px; }
.markdown-body :deep(pre) { background: var(--surface-2); padding: 12px; border-radius: 8px; overflow: auto; }
.markdown-body :deep(code) { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; }
.code { white-space: pre; background: var(--surface-2); border-radius: 8px; padding: 12px; overflow: auto; }

.file-preview.is-fullscreen .preview-media { max-height: 85vh; }
.file-preview.is-fullscreen .docx-wrap,
.file-preview.is-fullscreen .excel-wrap { height: 85vh; }
</style>
