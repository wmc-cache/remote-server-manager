<template>
  <section class="panel terminal-panel">
    <header class="panel__header">
      <h2>远程命令行</h2>
      <button v-if="store.deepSeekConfig.enabled" class="btn btn--ghost btn--sm" @click="toggleAI">
        {{ showAI ? '隐藏' : '显示' }} AI 工具
      </button>
    </header>

    <div class="terminal__screen">
      <div ref="historyEl" class="terminal__history scroll-area" @scroll="handleTerminalScroll">
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
        <h3>AI 工具</h3>
        <div class="ai-panel__header-actions">
          <small v-if="aiStatus" class="ai-status">{{ aiStatus }}</small>
          <button class="btn btn--ghost btn--xs" type="button" @click="openPromptPreview">
            提示语详情
          </button>
          <button class="btn btn--ghost btn--xs" type="button" :disabled="aiLoading" @click="clearChat">
            清空对话
          </button>
        </div>
      </div>

      <div class="ai-options">
        <label class="ai-option">
          <input type="checkbox" v-model="store.aiAssistantOptions.includeTerminalContext" />
          包含终端历史
        </label>
        <label class="ai-option">
          <input type="checkbox" v-model="store.aiAssistantOptions.includeFileContext" />
          包含文件管理信息
        </label>
        <label class="ai-option">
          <input type="checkbox" v-model="store.aiAssistantOptions.detailedExplain" />
          详细解释
        </label>
        <small class="ai-option__tip">勾选“包含...”会把相关内容发送给 DeepSeek，请勿包含敏感信息；“详细解释”仅影响回答风格</small>
      </div>

      <div ref="aiHistoryEl" class="ai-chat scroll-area" @scroll="handleAIScroll">
        <div v-if="!store.aiChatHistory?.length" class="ai-chat__empty">
          你可以问：生成命令、解释报错、查找配置文件位置、分析输出等
        </div>
        <div
          v-for="msg in store.aiChatHistory"
          :key="msg.id"
          class="ai-chat__message"
          :class="`ai-chat__message--${msg.role}`"
        >
          <div class="ai-chat__meta">
            <span class="ai-chat__role">{{ msg.role === 'user' ? '我' : 'AI' }}</span>
            <small v-if="msg.timestamp" class="ai-chat__time">{{ formatTime(msg.timestamp) }}</small>
            <div v-if="msg.role === 'assistant'" class="ai-chat__meta-actions">
              <button class="btn btn--ghost btn--xs" type="button" @click="copyToClipboard(msg.content)">
                复制
              </button>
              <button
                v-if="getFirstCommand(msg.content)"
                class="btn btn--ghost btn--xs"
                type="button"
                @click="executeFromText(msg.content)"
              >
                执行命令
              </button>
            </div>
          </div>
          <pre class="ai-chat__content">{{ msg.content }}</pre>
          <div v-if="msg.role === 'assistant' && getActions(msg.content).length" class="ai-chat__actions">
            <button
              v-for="(action, index) in getActions(msg.content)"
              :key="`${msg.id}-${index}`"
              class="btn btn--ghost btn--xs"
              type="button"
              @click="runAction(action)"
            >
              {{ formatActionLabel(action) }}
            </button>
          </div>
        </div>
      </div>

      <form class="ai-form ai-form--chat" @submit.prevent="sendChat()">
        <textarea
          v-model="aiInput"
          placeholder="输入你的问题，例如：nginx 的配置文件在哪？或者：根据刚才的错误输出怎么修复？"
          :disabled="aiLoading"
        ></textarea>
        <button class="btn btn--primary" type="submit" :disabled="aiLoading || !aiInput.trim()">
          {{ aiLoading ? '发送中...' : '发送' }}
        </button>
      </form>

      <div class="ai-tips">
        <small>💡 提示：</small>
        <div class="tips-list">
          <button class="tip-btn" type="button" @click="setPrompt('查看占用8080端口的进程，只给出命令')">
            查看端口占用
          </button>
          <button class="tip-btn" type="button" @click="setPrompt('查找大于100MB的文件，给出查找命令')">
            查找大文件
          </button>
          <button class="tip-btn" type="button" @click="setPrompt('查看系统资源使用情况，只给出命令')">
            系统资源
          </button>
          <button class="tip-btn" type="button" @click="setPrompt('压缩当前目录为tar.gz，只给出命令')">
            压缩文件
          </button>
          <button class="tip-btn" type="button" @click="setPrompt('nginx 的配置文件通常在哪？给出常见路径和查找命令')">
            Nginx 配置
          </button>
          <button class="tip-btn" type="button" @click="setPrompt('如何查找所有 .log 文件？给出命令')">
            查找 .log
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="promptPreviewVisible" class="modal">
        <div class="modal__backdrop" @click="closePromptPreview"></div>
        <section class="modal__dialog modal__dialog--wide">
          <header class="modal__header">
            <h2>提示语详情</h2>
            <button type="button" class="modal__close" @click="closePromptPreview">×</button>
          </header>
          <div class="prompt-preview">
            <small class="prompt-preview__tip">
              以下内容将发送给 DeepSeek（包含你勾选的上下文），请确认不包含敏感信息。
            </small>
            <textarea class="prompt-preview__textarea" readonly :value="promptPreviewText"></textarea>
            <footer class="modal__actions">
              <button class="btn btn--ghost" type="button" @click="closePromptPreview">关闭</button>
              <button class="btn btn--primary" type="button" @click="copyToClipboard(promptPreviewText)">
                复制
              </button>
            </footer>
          </div>
        </section>
      </div>
    </Teleport>
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
const aiInput = ref('');
const aiLoading = ref(false);
const aiStatus = ref('');
const aiHistoryEl = ref(null);
const terminalFollowOutput = ref(true);
const aiFollowOutput = ref(true);
const lastTerminalScrollTop = ref(0);
const lastAIScrollTop = ref(0);
const promptPreviewVisible = ref(false);
const promptPreviewText = ref('');
const assistantSystemPrompt = ref('');

let aiStreamUnsubscribe = null;
let currentAIExecId = null;
let currentAIConnectionId = null;
let timeoutTimer = null;

const orderedHistory = computed(() => {
  return [...(props.history || [])].reverse();
});

watch(
  () => props.history?.length,
  async () => {
    await nextTick();
    maybeAutoScrollTerminal();
  },
);

watch(
  () => props.history,
  async () => {
    await nextTick();
    maybeAutoScrollTerminal();
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
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
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
  if (showAI.value) {
    nextTick(() => maybeAutoScrollAI(true));
  }
}

function setPrompt(text) {
  aiInput.value = text;
}

function isNearBottom(el, threshold = 24) {
  if (!el) return true;
  const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
  return distance <= threshold;
}

function handleTerminalScroll() {
  const el = historyEl.value;
  if (!el) return;
  const curr = el.scrollTop;
  const prev = lastTerminalScrollTop.value;
  lastTerminalScrollTop.value = curr;
  if (curr < prev) {
    terminalFollowOutput.value = false;
    return;
  }
  terminalFollowOutput.value = isNearBottom(el, 24);
}

function handleAIScroll() {
  const el = aiHistoryEl.value;
  if (!el) return;
  const curr = el.scrollTop;
  const prev = lastAIScrollTop.value;
  lastAIScrollTop.value = curr;
  if (curr < prev) {
    aiFollowOutput.value = false;
    return;
  }
  aiFollowOutput.value = isNearBottom(el, 24);
}

function maybeAutoScrollTerminal(force = false) {
  const el = historyEl.value;
  if (!el) return;
  if (!force && !terminalFollowOutput.value) return;
  try {
    el.scrollTop = el.scrollHeight;
  } catch (_) {}
}

function maybeAutoScrollAI(force = false) {
  const el = aiHistoryEl.value;
  if (!el) return;
  if (!force && !aiFollowOutput.value) return;
  try {
    el.scrollTop = el.scrollHeight;
  } catch (_) {}
}

async function explainCommand(item) {
  if (!item?.command) return;

  showAI.value = true;
  const stdout = truncateText(item.stdout || '', 4000);
  const stderr = truncateText(item.stderr || '', 4000);
  const wantDetailed = store.aiAssistantOptions.detailedExplain !== false;
  const headerText = wantDetailed
    ? '请解释下面这条命令的作用、关键参数，并结合输出分析问题（如果有）：'
    : '请用尽量简洁的方式（少量要点）解释下面命令，并结合输出给出最可能原因与下一步排查命令：';
  const content = [
    headerText,
    '',
    `命令：\n\`\`\`bash\n${item.command}\n\`\`\``,
    stdout ? `标准输出：\n\`\`\`\n${stdout}\n\`\`\`` : '',
    stderr ? `错误输出：\n\`\`\`\n${stderr}\n\`\`\`` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  await sendChat(content);
}

function handleAIStream(data) {
  if (!data || data.execId !== currentAIExecId) return;

  if (data.type === 'data' && data.chunk) {
    const history = store.ensureAIChatHistory(currentAIConnectionId);
    const idx = history.findIndex((m) => m.id === currentAIExecId && m.role === 'assistant');
    if (idx !== -1) {
      history[idx].content = (history[idx].content || '') + data.chunk;
    }
    // 收到数据说明连接正常，清除超时
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    maybeAutoScrollAI();
  } else if (data.type === 'end') {
    aiLoading.value = false;
    aiStatus.value = '完成';
    setTimeout(() => {
      aiStatus.value = '';
    }, 2000);
    maybeAutoScrollAI();
  }
}

function truncateText(text, maxLen) {
  const value = String(text || '');
  if (!maxLen || value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}\n...（已截断，原始长度 ${value.length}）`;
}

function buildAIContext() {
  const parts = [];
  const wantDetailed = store.aiAssistantOptions.detailedExplain !== false;
  parts.push([
    '【偏好】',
    wantDetailed
      ? '命令解释：详细（给出必要说明与风险提示）'
      : '命令解释：简洁（除非我明确要求，否则命令相关尽量只给命令或少量要点）',
  ].join('\n'));

  if (store.aiAssistantOptions.includeFileContext) {
    const list = (store.remoteEntries || []).slice(0, 60).map((e) => ({
      name: e.filename,
      type: e.attrs?.isDirectory ? 'dir' : 'file',
      size: e.attrs?.size,
    }));
    parts.push([
      '【文件管理】',
      `当前目录：${store.remotePath || '/'}`,
      `目录项（最多 60 条）：${JSON.stringify(list)}`,
      store.previewFile?.path ? `当前预览：${store.previewFile.path}` : '',
    ].filter(Boolean).join('\n'));
  }

  if (store.aiAssistantOptions.includeTerminalContext) {
    const recent = (store.terminalHistory || []).slice(0, 12).map((h) => ({
      command: h.command,
      code: h.code,
      stdout: truncateText(h.stdout || '', 600),
      stderr: truncateText(h.stderr || '', 600),
    }));
    parts.push([
      '【终端】',
      `工作目录：${store.remotePath || '/'}`,
      `最近命令（最多 12 条，输出已截断）：${JSON.stringify(recent)}`,
    ].join('\n'));
  }

  return parts.join('\n\n');
}

function normalizeChatMessages(list) {
  return (list || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content || '') }))
    .filter((m) => m.content.trim())
    .slice(-40);
}

async function sendChat(overrideText = null) {
  if (aiLoading.value) return;
  if (!store.deepSeekConfig.enabled || !store.deepSeekConfig.apiKey) {
    aiStatus.value = 'DeepSeek 未配置或未启用';
    setTimeout(() => {
      aiStatus.value = '';
    }, 2000);
    return;
  }

  const text = String(overrideText ?? aiInput.value ?? '').trim();
  if (!text) return;

  aiLoading.value = true;
  aiStatus.value = 'AI 思考中...';
  currentAIExecId = `chat-${Date.now()}`;
  currentAIConnectionId = store.selectedConnectionId;

  const now = new Date().toISOString();
  const key = store.getTerminalKey(currentAIConnectionId);
  const history = store.ensureAIChatHistory(currentAIConnectionId);
  const nextHistory = [
    ...history,
    { id: `user-${Date.now()}`, role: 'user', content: text, timestamp: now },
    { id: currentAIExecId, role: 'assistant', content: '', timestamp: now },
  ].slice(-80);
  store.updateAIChatHistory(key, nextHistory);
  aiInput.value = '';
  await nextTick();
  maybeAutoScrollAI(true);

  // 30 秒超时保护（收到数据会清除）
  if (timeoutTimer) clearTimeout(timeoutTimer);
  timeoutTimer = setTimeout(() => {
    if (!aiLoading.value) return;
    aiLoading.value = false;
    aiStatus.value = 'AI 请求超时，请检查 API 配置或网络连接';
    setTimeout(() => {
      aiStatus.value = '';
    }, 3000);
  }, 30000);

  try {
    const payloadMessages = normalizeChatMessages(store.aiChatHistoryMap[key]);
    const context = buildAIContext();
    const result = await window.api.aiChat({
      messages: payloadMessages,
      context,
      execId: currentAIExecId,
    });

    if (!result?.ok) {
      throw new Error(result?.message || 'AI 请求失败');
    }
  } catch (error) {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    const list = store.ensureAIChatHistory(currentAIConnectionId);
    const idx = list.findIndex((m) => m.id === currentAIExecId && m.role === 'assistant');
    if (idx !== -1) {
      list[idx].content = `错误：${error.message}`;
    }
    aiLoading.value = false;
    aiStatus.value = '发送失败';
    setTimeout(() => {
      aiStatus.value = '';
    }, 2000);
  }
}

function clearChat() {
  store.clearAIChatHistory(store.selectedConnectionId);
  aiStatus.value = '已清空';
  setTimeout(() => {
    aiStatus.value = '';
  }, 1200);
}

function buildPromptPreviewPayload() {
  const connectionId = store.selectedConnectionId;
  const key = store.getTerminalKey(connectionId);
  const history = store.aiChatHistoryMap[key] || [];
  const draft = String(aiInput.value || '').trim();
  const list = draft ? [...history, { role: 'user', content: draft }] : history;
  const messages = normalizeChatMessages(list);
  const context = buildAIContext();

  return {
    meta: {
      apiBaseUrl: store.deepSeekConfig?.apiBaseUrl || '',
      model: store.deepSeekConfig?.model || '',
    },
    preferences: { ...store.aiAssistantOptions },
    systemPrompt: assistantSystemPrompt.value || '(未获取到系统提示词)',
    context,
    messages,
  };
}

async function openPromptPreview() {
  try {
    if (!assistantSystemPrompt.value && window.api?.getAISystemPrompt) {
      assistantSystemPrompt.value = await window.api.getAISystemPrompt();
    }
  } catch (_) {
    assistantSystemPrompt.value = '';
  }

  const payload = buildPromptPreviewPayload();
  promptPreviewText.value = JSON.stringify(payload, null, 2);
  promptPreviewVisible.value = true;
}

function closePromptPreview() {
  promptPreviewVisible.value = false;
}

function extractFirstCommand(text) {
  if (!text) return '';
  const blocks = [...String(text).matchAll(/```(?:bash|sh|shell)?\s*([\s\S]*?)```/gi)];
  const candidates = blocks.length ? blocks.map((m) => m[1]) : [text];
  for (const chunk of candidates) {
    const lines = String(chunk)
      .split('\n')
      .map((line) => line.trim())
      .map((line) => line.replace(/^\$\s*/, ''))
      .filter(Boolean);
    for (const line of lines) {
      if (/^(#|[-*])/.test(line)) continue;
      if (/^```/.test(line)) continue;
      return line;
    }
  }
  return '';
}

function getFirstCommand(text) {
  return extractFirstCommand(text);
}

function isDangerousCommand(cmd) {
  const value = String(cmd || '').toLowerCase();
  return /\brm\b/.test(value)
    || /\bmkfs\b/.test(value)
    || /\bdd\b/.test(value)
    || /\bshutdown\b/.test(value)
    || /\breboot\b/.test(value)
    || /\bchmod\b/.test(value)
    || /\bchown\b/.test(value)
    || /\bsudo\b/.test(value);
}

async function executeFromText(text) {
  const cmd = extractFirstCommand(text);
  if (!cmd) return;
  const dangerous = isDangerousCommand(cmd);
  if (dangerous) {
    const ok = window.confirm(`该命令可能有风险，确认执行？\n\n${cmd}`);
    if (!ok) return;
  }
  emit('execute', cmd);
  aiStatus.value = '命令已发送到终端';
  setTimeout(() => {
    aiStatus.value = '';
  }, 1500);
}

function parseRsmActions(text) {
  const actions = [];
  if (!text) return actions;
  const matches = [...String(text).matchAll(/```rsm-action\s*([\s\S]*?)```/gi)];
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) {
        parsed.forEach((a) => { if (a && typeof a === 'object') actions.push(a); });
      } else if (parsed && typeof parsed === 'object') {
        actions.push(parsed);
      }
    } catch (_) {}
  }
  return actions
    .filter((a) => typeof a.type === 'string')
    .slice(0, 6);
}

function getActions(text) {
  return parseRsmActions(text);
}

function formatActionLabel(action) {
  if (!action || !action.type) return '执行';
  if (action.type === 'terminal.execute') return action.note ? `执行：${action.note}` : '执行命令';
  if (action.type === 'file.preview') return action.note ? `预览：${action.note}` : '预览文件';
  if (action.type === 'file.list') return action.note ? `打开：${action.note}` : '打开目录';
  return action.note ? action.note : action.type;
}

async function runAction(action) {
  if (!action || !action.type) return;
  if (action.type === 'terminal.execute') {
    await executeFromText(String(action.command || ''));
    return;
  }
  if (action.type === 'file.preview') {
    if (!store.selectedConnectionId) {
      aiStatus.value = '请先连接服务器';
      setTimeout(() => { aiStatus.value = ''; }, 1500);
      return;
    }
    if (!action.path) return;
    await store.previewRemoteFile(String(action.path));
    aiStatus.value = '已请求预览文件，请切换到文件管理查看';
    setTimeout(() => { aiStatus.value = ''; }, 2500);
    return;
  }
  if (action.type === 'file.list') {
    if (!store.selectedConnectionId) {
      aiStatus.value = '请先连接服务器';
      setTimeout(() => { aiStatus.value = ''; }, 1500);
      return;
    }
    const path = String(action.path || '').trim();
    if (!path) return;
    await store.fetchRemoteDirectory(path);
    aiStatus.value = '已打开目录，请切换到文件管理查看';
    setTimeout(() => { aiStatus.value = ''; }, 2500);
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

.ai-panel__header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ai-panel__header h3 { margin: 0; font-size: 15px; color: #fbbf24; }
.ai-panel__header-actions { display: flex; align-items: center; gap: 8px; }
.ai-status { color: #64748b; font-size: 12px; }

.ai-options { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.ai-option { display: inline-flex; align-items: center; gap: 6px; color: #cbd5e1; font-size: 12px; }
.ai-option__tip { color: #64748b; font-size: 12px; }

.ai-chat { max-height: 280px; overflow: auto; padding: 10px; background: var(--surface-1); border: 1px solid var(--panel-border); border-radius: 10px; display: flex; flex-direction: column; gap: 10px; }
.ai-chat__empty { color: #94a3b8; font-size: 13px; padding: 8px 4px; }
.ai-chat__message { display: flex; flex-direction: column; gap: 6px; }
.ai-chat__meta { display: flex; align-items: center; gap: 8px; color: #94a3b8; font-size: 12px; }
.ai-chat__role { color: #e2e8f0; font-weight: 600; }
.ai-chat__time { color: #64748b; }
.ai-chat__meta-actions { margin-left: auto; display: flex; gap: 6px; }
.ai-chat__content { margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 13px; color: #e2e8f0; }
.ai-chat__actions { display: flex; flex-wrap: wrap; gap: 6px; }

.ai-form--chat { display: flex; flex-direction: column; gap: 8px; }
.ai-form--chat textarea { width: 100%; min-height: 70px; background: var(--surface-1); border: 1px solid var(--panel-border); border-radius: 8px; padding: 8px 12px; color: #e2e8f0; font-size: 13px; outline: none; resize: vertical; }
.ai-form--chat textarea:focus { border-color: #3b82f6; }

.ai-tips { display: flex; flex-direction: column; gap: 6px; }
.ai-tips small { color: #9ca3af; font-size: 12px; }
.tips-list { display: flex; flex-wrap: wrap; gap: 6px; }
.tip-btn { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer; }
.tip-btn:hover { background: rgba(59, 130, 246, 0.2); }

/* 滚动条 */
.scroll-area::-webkit-scrollbar { width: 6px; height: 6px; }
.scroll-area::-webkit-scrollbar-track { background: transparent; }
.scroll-area::-webkit-scrollbar-thumb { background: var(--panel-border); border-radius: 3px; }

/* 提示语详情弹框 */
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
}

.modal__dialog {
  position: relative;
  background: var(--surface-1);
  border-radius: 12px;
  padding: 16px;
  width: min(560px, 92vw);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.45);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--panel-border);
  backdrop-filter: var(--panel-blur);
  max-height: 82vh;
}

.modal__dialog--wide {
  width: min(920px, 94vw);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.modal__header h2 {
  margin: 0;
  font-size: 14px;
  color: #fbbf24;
}

.modal__close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 22px;
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
}

.modal__close:hover {
  color: #e2e8f0;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.prompt-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.prompt-preview__tip {
  color: #94a3b8;
  font-size: 12px;
}

.prompt-preview__textarea {
  width: 100%;
  min-height: 320px;
  max-height: 62vh;
  resize: vertical;
  border-radius: 10px;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  color: #e2e8f0;
  padding: 12px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  line-height: 1.5;
  outline: none;
}
</style>
