<template>
  <div class="ai-config">
    <button v-if="!showConfig" class="btn-config" @click="openConfig" title="AI 设置">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M12 1v6m0 6v6m4.22-10.22l4.24-4.24M6.34 6.34L2.1 2.1m17.9 17.9l-4.24-4.24M6.34 17.66l-4.24 4.24"></path>
      </svg>
    </button>

    <div v-else class="config-panel">
      <header class="config-header">
        <h3>DeepSeek AI 配置</h3>
        <button class="btn-close" @click="closeConfig">×</button>
      </header>

      <div class="config-body">
        <div class="form-group">
          <label>
            <input type="checkbox" v-model="config.enabled" />
            启用 AI 助手
          </label>
        </div>

        <div class="form-group">
          <label>API Key</label>
          <input
            v-model="config.apiKey"
            type="password"
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
            :disabled="!config.enabled"
          />
          <small class="help-text">
            从 https://platform.deepseek.com/api_keys 获取 API Key
          </small>
        </div>

        <div class="form-group">
          <label>API 地址</label>
          <input
            v-model="config.apiBaseUrl"
            placeholder="https://api.deepseek.com"
            :disabled="!config.enabled"
          />
        </div>

        <div class="form-group">
          <label>模型</label>
          <select v-model="config.model" :disabled="!config.enabled">
            <option value="deepseek-chat">deepseek-chat (通用对话)</option>
            <option value="deepseek-coder">deepseek-coder (代码生成)</option>
          </select>
        </div>

        <div class="config-actions">
          <button class="btn btn--ghost" @click="closeConfig">取消</button>
          <button class="btn btn--primary" @click="saveConfig" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>

        <div v-if="message" class="message" :class="`message--${messageType}`">
          {{ message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useMainStore } from '../store/mainStore';

const store = useMainStore();
const emit = defineEmits(['saved']);

const showConfig = ref(false);
const saving = ref(false);
const message = ref('');
const messageType = ref('info');

const config = ref({
  apiKey: '',
  apiBaseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  enabled: false,
});

onMounted(async () => {
  await store.loadDeepSeekConfig();
});

watch(
  () => store.deepSeekConfig,
  (value) => {
    config.value = { ...value };
  },
  { deep: true, immediate: true },
);

function openConfig() {
  showConfig.value = true;
  message.value = '';
}

function closeConfig() {
  showConfig.value = false;
  message.value = '';
  // 恢复原始配置
  config.value = { ...store.deepSeekConfig };
}

async function saveConfig() {
  saving.value = true;
  message.value = '';

  try {
    if (config.value.enabled && !config.value.apiKey) {
      throw new Error('启用 AI 助手需要填写 API Key');
    }

    const result = await store.saveDeepSeekConfig(config.value);

    if (result.ok) {
      message.value = '配置已保存';
      messageType.value = 'success';
      emit('saved', config.value);
      setTimeout(() => {
        closeConfig();
      }, 1000);
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    message.value = error.message;
    messageType.value = 'error';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.ai-config {
  position: relative;
}

.btn-config {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: #e2e8f0;
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-config:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: #3b82f6;
}

.config-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  width: 380px;
  background: var(--surface-2);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--panel-border);
}

.config-header h3 {
  margin: 0;
  font-size: 14px;
  color: #fbbf24;
}

.btn-close {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  color: #e2e8f0;
}

.config-body {
  padding: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #e2e8f0;
}

.form-group input[type="text"],
.form-group input[type="password"],
.form-group select {
  width: 100%;
  background: var(--surface-1);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 12px;
  color: #e2e8f0;
  font-size: 13px;
  outline: none;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #3b82f6;
}

.form-group input:disabled,
.form-group select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.help-text {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
}

.config-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

.message {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
}

.message--success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #34d399;
}

.message--error {
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.3);
  color: #f87171;
}
</style>
