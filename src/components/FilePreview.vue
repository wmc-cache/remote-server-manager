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

    <!-- 文本/代码 使用 Monaco 只读预览 -->
    <MonacoViewer
      v-else-if="type === 'text' || type === 'markdown'"
      :value="textContent"
      :language="monacoLanguage"
      :fullscreen="fullscreen"
    />

    <!-- 兜底提示 -->
    <div v-else class="empty">暂不支持此类型预览：{{ ext }}</div>
  </div>
  
</template>

<script setup>
import { computed } from 'vue';
import VuePdf from '@tato30/vue-pdf';
import VueOfficeDocx from '@vue-office/docx';
import VueOfficeExcel from '@vue-office/excel';
import '@vue-office/docx/lib/index.css';
import '@vue-office/excel/lib/index.css';
import MonacoViewer from './MonacoViewer.vue';

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

// 文本内容
const textContent = computed(() => (file.value?.encoding === 'text' ? file.value?.content || '' : ''));

// 根据扩展名推测 Monaco 语言
const monacoLanguage = computed(() => {
  const e = ext.value;
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

.file-preview.is-fullscreen .preview-media { max-height: 85vh; }
.file-preview.is-fullscreen .docx-wrap,
.file-preview.is-fullscreen .excel-wrap { height: 85vh; }
</style>
