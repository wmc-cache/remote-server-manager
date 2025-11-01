<template>
  <Teleport to="body">
    <div v-if="visible" class="modal">
      <div class="modal__backdrop" @click="emit('close')"></div>
      <section class="modal__dialog">
        <header class="modal__header">
          <h2>{{ isEdit ? '编辑连接' : '新增连接' }}</h2>
          <button type="button" class="modal__close" @click="emit('close')">×</button>
        </header>
        <form class="form" @submit.prevent="handleSubmit">
          <label class="form__field">
            <span>名称</span>
            <input v-model="form.name" placeholder="自定义名称" />
          </label>
          <label class="form__field">
            <span>主机地址</span>
            <input v-model="form.host" required placeholder="example.com" />
          </label>
          <label class="form__field">
            <span>端口</span>
            <input v-model.number="form.port" type="number" min="1" max="65535" />
          </label>
          <label class="form__field">
            <span>用户名</span>
            <input v-model="form.username" required placeholder="root" />
          </label>
          <label class="form__field">
            <span>密码 (可选)</span>
            <input v-model="form.password" type="password" placeholder="••••" />
          </label>
          <label class="form__field">
            <span>私钥 (PEM) 可选</span>
            <textarea v-model="form.privateKey" rows="4" placeholder="-----BEGIN PRIVATE KEY-----"></textarea>
          </label>
          <label class="form__field">
            <span>私钥密码 (可选)</span>
            <input v-model="form.passphrase" type="password" />
          </label>
          <footer class="modal__actions">
            <button class="btn btn--ghost" type="button" @click="emit('close')">取消</button>
            <button class="btn" type="submit">保存连接</button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, watch, computed } from 'vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  connection: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['submit', 'close']);

const form = reactive({
  name: '',
  host: '',
  port: 22,
  username: '',
  password: '',
  privateKey: '',
  passphrase: '',
});

const isEdit = computed(() => !!props.connection?.id);

// 当弹窗打开或传入的连接变更时，填充/重置表单
watch(
  () => [props.visible, props.connection],
  () => {
    if (props.visible && props.connection) {
      const c = props.connection;
      form.name = c.name || '';
      form.host = c.host || '';
      form.port = c.port || 22;
      form.username = c.username || '';
      form.password = c.password || '';
      form.privateKey = c.privateKey || '';
      form.passphrase = c.passphrase || '';
    } else if (!props.visible) {
      form.name = '';
      form.host = '';
      form.port = 22;
      form.username = '';
      form.password = '';
      form.privateKey = '';
      form.passphrase = '';
    }
  },
  { immediate: true, deep: true },
);

function handleSubmit() {
  const payload = props.connection?.id ? { id: props.connection.id, ...form } : { ...form };
  emit('submit', payload);
}
</script>

<style scoped>
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
  border-radius: var(--radius-lg);
  padding: 24px;
  width: min(540px, 90vw);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.45);
  display: flex;
  flex-direction: column;
  gap: 18px;
  border: 1px solid var(--panel-border);
  backdrop-filter: var(--panel-blur);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal__close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 24px;
  cursor: pointer;
}

.form {
  display: grid;
  gap: 14px;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}

.form__field > span {
  color: #94a3b8;
}

input,
textarea {
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--surface-2);
  color: #f8fafc;
  padding: 8px 10px;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.btn {
  padding: 10px 18px;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
}

.btn--ghost {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: #e2e8f0;
}

.btn {
  /* ensure accent variables apply */
}
</style>
