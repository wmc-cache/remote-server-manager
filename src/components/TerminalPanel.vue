<template>
  <section class="panel terminal-panel">
    <header class="panel__header">
      <h2>远程命令行</h2>
      <button v-if="store.deepSeekConfig.enabled" class="btn btn--ghost btn--sm" @click="toggleAI">
        {{ showAI ? '隐藏' : '显示' }} AI 助手
      </button>
    </header>

    <div class="terminal__screen">
      <div ref="historyEl" class="terminal__history scroll-area">
        <template v-for="item in orderedHistory" :key="item.timestamp || item.id">
          <div class="terminal__line">
            <span class="terminal__prompt">$</span>
            <span class="terminal__command">{{ item.command }}</span>
            <button v-if="showAI && store.deepSeekConfig.enabled" class="btn btn--ghost btn--xs" @click="explainCommand(item)">
              解释
            </button>
            <small class="terminal__meta">{{ formatTime(item.timestamp) }} · 退出码 {{ item.code }}</small>
          </div>
          <pre v-if="item.stdout" class="terminal__stdout">{{ item.stdout }}</pre>
          <pre v-if="item.stderr" class="terminal__stderr">{{ item.stderr }}</pre>
        </template>
      </div>

      <form class="terminal__form" @submit.prevent="handleExecute">
        <span class="terminal__prompt">$</span>
        <input v-model="command" placeholder="输入要执行的命令，例如 ls -al" />
        <button class="btn btn--ghost" type="submit">执行</button>
      </form>
    </div>

    <!-- AI 助手面板 -->
    <div v-if="showAI" class="ai-panel">
      <div class="ai-panel__header">
        <h3>DeepSeek AI 助手</h3>
        <small v-if="aiStatus" class="ai-status">{{ aiStatus }}</small>
      </div>

      <form class="ai-form" @submit.prevent="generateCommand">
        <input
          v-model="aiPrompt"
          placeholder="用自然语言描述你想要执行的命令，例如：查找并删除3天前的日志文件"
        />
        <button class="btn btn--primary" type="submit" :disabled="aiLoading">
          {{ aiLoading ? '生成中...' : '生成命令' }}
        </button>
      </form>

      <div v-if="aiResponse || aiLoading" class="ai-response">
        <div class="ai-response__header">
          <strong>AI 回复：</strong>
          <button v-if="aiResponse && !aiLoading" class="btn btn--ghost btn--xs" @click="copyToClipboard(aiResponse)">
            复制
          </button>
        </div>
        <div class="ai-response__content">
          <pre v-if="aiResponse">{{ aiResponse }}</pre>
          <span v-else-if="aiStreaming" class="ai-streaming">{{ aiStreaming }}</span>
          <span v-else class="ai-loading">等待 AI 响应...</span>
        </div>
      </div>

      <div class="ai-tips">
        <small>💡 提示：</small>
        <div class="tips-list">
          <button class="tip-btn" @click="setPrompt('查看占用8080端口的进程')">
            查看端口占用
          </button>
          <button class="tip-btn" @click="setPrompt('查找大于100MB的文件')">
            查找大文件
          </button>
          <button class="tip-btn" @click="setPrompt('查看系统资源使用情况')">
            系统资源
          </button>
          <button class="tip-btn" @click="setPrompt('压缩当前目录为tar.gz')">
            压缩文件
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMainStore } from '../store/mainStore';

const props = defineProps({
  history: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['execute']);
const store = useMainStore();

const command = ref('');
const historyEl = ref(null);
const showAI = ref(false);

// AI 相关状态
const aiPrompt = ref('');
const aiResponse = ref('');
const aiStreaming = ref('');
const aiLoading = ref(false);
const aiStatus = ref('');

let aiStreamUnsubscribe = null;
let currentAIExecId = null;

const orderedHistory = computed(() => {
  return [...(props.history || [])].reverse();
});

watch(
  () => props.history?.length,
  async () => {
    await nextTick();
    try {
      historyEl.value?.scrollTo({ top: historyEl.value.scrollHeight, behavior: 'smooth' });
    } catch (_) {}
  },
);

watch(
  () => props.history,
  async () => {
    await nextTick();
    try {
      historyEl.value?.scrollTo({ top: historyEl.value.scrollHeight });
    } catch (_) {}
  },
  { deep: true },
);

onMounted(() => {
  aiStreamUnsubscribe = window.api.onAIStreamData(handleAIStream);
});

onUnmounted(() => {
  if (aiStreamUnsubscribe) {
    aiStreamUnsubscribe();
  }
});

function handleExecute() {
  if (!command.value.trim()) {
    return;
  }
  emit('execute', command.value.trim());
  command.value = '';
}

function toggleAI() {
  showAI.value = !showAI.value;
}

function setPrompt(text) {
  aiPrompt.value = text;
}

async function generateCommand() {
  if (!aiPrompt.value.trim() || aiLoading.value) {
    return;
  }

  currentAIExecId = `ai-${Date.now()}`;
  aiLoading.value = true;
  aiResponse.value = '';
  aiStreaming.value = '';
  aiStatus.value = '正在生成命令...';

  try {
    const result = await window.api.aiGenerateCommand({
      prompt: aiPrompt.value.trim(),
      execId: currentAIExecId,
    });

    if (!result.ok) {
      aiResponse.value = `错误：${result.message}`;
      aiStatus.value = '生成失败';
    }
  } catch (error) {
    aiResponse.value = `错误：${error.message}`;
    aiStatus.value = '生成失败';
    aiLoading.value = false;
  }
}

async function explainCommand(item) {
  if (!item?.command) return;

  currentAIExecId = `explain-${Date.now()}`;
  aiLoading.value = true;
  aiResponse.value = '';
  aiStreaming.value = '';
  aiStatus.value = '正在解释命令...';
  showAI.value = true;

  try {
    const result = await window.api.aiExplainCommand({
      command: item.command,
      stdout: item.stdout || '',
      stderr: item.stderr || '',
      execId: currentAIExecId,
    });

    if (!result.ok) {
      aiResponse.value = `错误：${result.message}`;
      aiStatus.value = '解释失败';
      aiLoading.value = false;
    }
  } catch (error) {
    aiResponse.value = `错误：${error.message}`;
    aiStatus.value = '解释失败';
    aiLoading.value = false;
  }
}

function handleAIStream(data) {
  if (!data || data.execId !== currentAIExecId) return;

  if (data.type === 'data' && data.chunk) {
    aiStreaming.value += data.chunk;
  } else if (data.type === 'end') {
    aiResponse.value = data.fullResponse || aiStreaming.value;
    aiStreaming.value = '';
    aiLoading.value = false;
    aiStatus.value = '完成';
    setTimeout(() => {
      aiStatus.value = '';
    }, 2000);
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    aiStatus.value = '已复制到剪贴板';
    setTimeout(() => {
      aiStatus.value = '';
    }, 1500);
  } catch (error) {
    console.error('复制失败:', error);
    aiStatus.value = '复制失败';
  }
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}
</script>

<style scoped>
.panel { background: var(--surface-1); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px; height: 100%; border: 1px solid var(--panel-border); backdrop-filter: var(--panel-blur); }

.terminal-panel { padding: 16px; }

.panel__header { display: flex; justify-content: space-between; align-items: center; }
.panel__header h2 { margin: 0; font-size: 16px; }

.terminal__screen {
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  border-radius: 12px;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.terminal__history { max-height: 260px; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }

.terminal__line { display: flex; align-items: baseline; gap: 8px; }
.terminal__prompt { color: #22c55e; }
.terminal__command { color: #e2e8f0; font-weight: 500; flex: 1; }
.terminal__meta { color: #64748b; font-size: 12px; }

.terminal__stdout { white-space: pre-wrap; color: #d1fae5; font-size: 13px; margin: 0 0 8px 20px; }
.terminal__stderr { white-space: pre-wrap; color: #f87171; font-size: 13px; margin: 0 0 8px 20px; }

.terminal__form { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--panel-border); background: var(--surface-2); }
.terminal__form input { flex: 1; background: transparent; border: none; outline: none; color: #e2e8f0; padding: 6px 0; font-family: inherit; font-size: 13px; }

.btn { background: var(--accent-solid); border: none; color: #fff; border-radius: 8px; padding: 8px 16px; cursor: pointer; }
.btn.btn--ghost { background: transparent; border: 1px solid var(--panel-border); color: #e2e8f0; }
.btn.btn--primary { background: #3b82f6; border: 1px solid #3b82f6; }
.btn.btn--xs { padding: 4px 8px; font-size: 12px; }
.btn.btn--sm { padding: 6px 12px; font-size: 13px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* AI 助手样式 */
.ai-panel { margin-top: 12px; padding: 16px; background: var(--surface-2); border: 1px solid var(--panel-border); border-radius: 12px; display: flex; flex-direction: column; gap: 16px; }

.ai-panel__header { display: flex; justify-content: space-between; align-items: center; }
.ai-panel__header h3 { margin: 0; font-size: 15px; color: #fbbf24; }
.ai-status { color: #64748b; font-size: 12px; }

.ai-form { display: flex; gap: 8px; }
.ai-form input { flex: 1; background: var(--surface-1); border: 1px solid var(--panel-border); border-radius: 8px; padding: 8px 12px; color: #e2e8f0; font-size: 13px; outline: none; }
.ai-form input:focus { border-color: #3b82f6; }

.ai-response { padding: 12px; background: var(--surface-1); border: 1px solid var(--panel-border); border-radius: 8px; }
.ai-response__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.ai-response__header strong { color: #fbbf24; font-size: 13px; }
.ai-response__content pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 13px; color: #e2e8f0; }
.ai-response__content .ai-streaming { color: #d1d5db; font-size: 13px; }
.ai-response__content .ai-loading { color: #9ca3af; font-size: 13px; font-style: italic; }

.ai-tips { display: flex; flex-direction: column; gap: 6px; }
.ai-tips small { color: #9ca3af; font-size: 12px; }
.tips-list { display: flex; flex-wrap: wrap; gap: 6px; }
.tip-btn { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer; }
.tip-btn:hover { background: rgba(59, 130, 246, 0.2); }

/* 滚动条 */
.scroll-area::-webkit-scrollbar { width: 6px; height: 6px; }
.scroll-area::-webkit-scrollbar-track { background: transparent; }
.scroll-area::-webkit-scrollbar-thumb { background: var(--panel-border); border-radius: 3px; }
</style>

