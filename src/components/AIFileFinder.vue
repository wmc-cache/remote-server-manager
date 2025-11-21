<template>
  <section class="panel ai-file-finder">
    <header class="panel__header">
      <h2>🔍 AI 文件查找器</h2>
    </header>

    <div class="ai-finder__content">
      <!-- 输入区域 -->
      <div class="ai-finder__input-section">
        <form class="ai-form" @submit.prevent="findFile">
          <textarea
            v-model="query"
            placeholder="输入你想查找的文件问题，例如：\n• nginx的配置文件在哪\n• 如何查找所有的日志文件\n• mysql的数据文件位置\n• 查找大于100MB的文件"
          ></textarea>
          <button class="btn btn--primary" type="submit" :disabled="loading || !query.trim()">
            {{ loading ? 'AI思考中...' : '开始查找' }}
          </button>
        </form>
      </div>

      <!-- 提示示例 -->
      <div v-if="!response && !loading" class="ai-finder__tips">
        <small>💡 试试这些问题：</small>
        <div class="tips-grid">
          <button class="tip-btn" @click="setQuery('nginx的配置文件在哪')">
            Nginx配置
          </button>
          <button class="tip-btn" @click="setQuery('mysql的数据文件在哪')">
            MySQL数据
          </button>
          <button class="tip-btn" @click="setQuery('系统日志文件位置')">
            系统日志
          </button>
          <button class="tip-btn" @click="setQuery('如何查找所有 .log 文件')">
            查找log文件
          </button>
          <button class="tip-btn" @click="setQuery('查找大于1GB的文件')">
            大文件查找
          </button>
          <button class="tip-btn" @click="setQuery('redis配置文件位置')">
            Redis配置
          </button>
        </div>
      </div>

      <!-- 结果显示区域 -->
      <div v-if="response || loading" class="ai-finder__response">
        <div class="response__header">
          <h3>🤖 AI 回复</h3>
          <div class="response__actions" v-if="response && !loading">
            <button class="btn btn--ghost btn--sm" @click="copyResponse">
              复制
            </button>
            <button class="btn btn--ghost btn--sm" @click="clearResponse">
              清空
            </button>
          </div>
        </div>

        <div class="response__content">
          <div v-if="loading" class="loading">
            <span class="loading-icon">⏳</span>
            <span>AI正在分析并生成查找命令...</span>
          </div>
          <div v-else-if="streaming" class="streaming">
            <pre>{{ streaming }}</pre>
          </div>
          <div v-else-if="response" class="response">
            <pre>{{ response }}</pre>
          </div>
        </div>

        <!-- 执行命令按钮 -->
        <div v-if="response && !loading" class="response__execute">
          <button class="btn btn--success" :disabled="executing" @click="executeInTerminal">
            {{ executing ? '执行中...' : '在终端执行查找命令' }}
          </button>
          <small class="execute-tip">点击后将在终端面板中执行推荐的查找命令</small>
        </div>
      </div>

      <!-- 状态消息 -->
      <div v-if="status" class="ai-finder__status" :class="statusType">
        {{ status }}
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useMainStore } from '../store/mainStore';

const store = useMainStore();

const query = ref('');
const response = ref('');
const streaming = ref('');
const loading = ref(false);
const status = ref('');
const statusType = ref('info');
const executing = ref(false);

let currentExecId = null;
let aiStreamUnsubscribe = null;
let timeoutTimer = null;

// 监听AI流式响应
if (window.api?.onAIStreamData) {
  aiStreamUnsubscribe = window.api.onAIStreamData(handleAIStream);
}

watch(
  () => store.selectedConnectionId,
  () => {
    query.value = '';
    response.value = '';
    streaming.value = '';
    status.value = '';
    statusType.value = 'info';
    executing.value = false;
    loading.value = false;
    currentExecId = null;
  },
);

function setQuery(text) {
  query.value = text;
}

async function findFile() {
  if (!query.value.trim() || loading.value) {
    return;
  }

  // 重置状态
  response.value = '';
  streaming.value = '';
  status.value = '';
  loading.value = true;
  currentExecId = `ai-find-${Date.now()}`;

  // 设置30秒超时
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }
  timeoutTimer = setTimeout(() => {
    if (loading.value) {
      loading.value = false;
      status.value = 'AI请求超时，请检查API配置或网络连接';
      statusType.value = 'error';
    }
  }, 30000);

  try {
    const result = await store.aiFindFile(query.value.trim(), currentExecId);

    if (!result.ok) {
      status.value = result.message;
      statusType.value = 'error';
      loading.value = false;
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    }
  } catch (error) {
    status.value = `错误：${error.message}`;
    statusType.value = 'error';
    loading.value = false;
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
  }
}

function handleAIStream(data) {
  if (!data || data.execId !== currentExecId) return;

  if (data.type === 'data' && data.chunk) {
    streaming.value += data.chunk;
    // 清除超时（收到数据说明AI正常响应）
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  } else if (data.type === 'end') {
    response.value = data.fullResponse || streaming.value;
    streaming.value = '';
    loading.value = false;
    status.value = '文件查找建议已生成完成';
    statusType.value = 'success';
    // 清除超时
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    setTimeout(() => {
      status.value = '';
    }, 3000);
  }
}

async function copyResponse() {
  if (!response.value) return;

  try {
    await navigator.clipboard.writeText(response.value);
    status.value = '已复制到剪贴板';
    statusType.value = 'success';
    setTimeout(() => {
      status.value = '';
    }, 1500);
  } catch (error) {
    status.value = '复制失败';
    statusType.value = 'error';
  }
}

function clearResponse() {
  response.value = '';
  streaming.value = '';
  status.value = '';
}

function extractCommand(text) {
  if (!text) return '';
  // 优先取代码块中的第一条命令
  const codeBlock = text.match(/```(?:bash|shell)?\s*([\s\S]*?)```/i);
  const blockContent = codeBlock ? codeBlock[1] : text;
  const lines = blockContent
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.replace(/^\$\s*/, '')) // 去掉可能的 shell 提示符
    .filter(Boolean);

  for (const line of lines) {
    if (/^(#|[-*])/.test(line)) continue; // 跳过注释或列表行
    if (/^```/.test(line)) continue;
    return line;
  }
  return '';
}

async function executeInTerminal() {
  if (loading.value || executing.value) return;
  if (!store.selectedConnectionId) {
    status.value = '请先连接服务器后再执行';
    statusType.value = 'error';
    return;
  }

  const cmd = extractCommand(response.value || streaming.value);
  if (!cmd) {
    status.value = '未找到可执行的命令，请复制后手动调整';
    statusType.value = 'error';
    return;
  }

  executing.value = true;
  status.value = '正在发送到终端执行...';
  statusType.value = 'info';

  try {
    await store.executeCommand(cmd);
    status.value = '命令已发送到终端面板，请在终端工具中查看执行结果';
    statusType.value = 'success';
  } catch (error) {
    status.value = `执行失败：${error.message}`;
    statusType.value = 'error';
  } finally {
    executing.value = false;
  }
}

// 清理
if (aiStreamUnsubscribe) {
  window.addEventListener('beforeunload', () => {
    aiStreamUnsubscribe();
  });
}
</script>

<style scoped>
.panel {
  background: var(--surface-1);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  border: 1px solid var(--panel-border);
  backdrop-filter: var(--panel-blur);
}

.panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--panel-border);
}

.panel__header h2 {
  margin: 0;
  font-size: 16px;
  color: #fbbf24;
}

.ai-file-finder {
  padding: 16px;
}

.ai-finder__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  overflow: hidden;
}

/* 输入区域 */
.ai-finder__input-section {
  flex-shrink: 0;
}

.ai-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-form textarea {
  width: 100%;
  min-height: 100px;
  background: var(--surface-2);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 12px;
  color: #e2e8f0;
  font-size: 14px;
  resize: vertical;
  outline: none;
  transition: all 0.2s;
}

.ai-form textarea:focus {
  border-color: #3b82f6;
}

.ai-form textarea::placeholder {
  color: #64748b;
}

.btn {
  background: var(--accent-solid);
  border: none;
  color: #fff;
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: #3b82f6;
  border: 1px solid #3b82f6;
}

.btn--primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn--ghost {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: #e2e8f0;
}

.btn--ghost:hover {
  background: var(--surface-2);
}

.btn--sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn--success {
  background: #10b981;
  border: 1px solid #10b981;
}

.btn--success:hover {
  background: #059669;
}

/* 提示示例 */
.ai-finder__tips {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.ai-finder__tips small {
  color: #9ca3af;
  font-size: 12px;
}

.tips-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.tip-btn {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tip-btn:hover {
  background: rgba(59, 130, 246, 0.2);
}

/* 响应区域 */
.ai-finder__response {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow: hidden;
}

.response__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.response__header h3 {
  margin: 0;
  font-size: 14px;
  color: #fbbf24;
}

.response__actions {
  display: flex;
  gap: 8px;
}

.response__content {
  flex: 1;
  overflow: auto;
  background: var(--surface-2);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 12px;
}

.response__content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.5;
}

.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9ca3af;
  font-size: 13px;
}

.loading-icon {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.streaming {
  opacity: 0.8;
}

.response__execute {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  padding-top: 8px;
  border-top: 1px solid var(--panel-border);
}

.execute-tip {
  color: #64748b;
  font-size: 11px;
}

/* 状态消息 */
.ai-finder__status {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
  flex-shrink: 0;
}

.ai-finder__status.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.ai-finder__status.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.ai-finder__status.info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
}

/* 滚动条 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--panel-border);
  border-radius: 3px;
}
</style>
