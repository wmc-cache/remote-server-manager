<template>
  <section class="panel">
    <header class="panel__header">
      <h2>新增连接</h2>
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
      <button class="btn" type="submit">保存连接</button>
    </form>
  </section>
</template>

<script setup>
import { reactive } from 'vue';

const emit = defineEmits(['submit']);

const form = reactive({
  name: '',
  host: '',
  port: 22,
  username: '',
  password: '',
  privateKey: '',
  passphrase: '',
});

function handleSubmit() {
  emit('submit', { ...form });
  form.name = '';
  form.host = '';
  form.port = 22;
  form.username = '';
  form.password = '';
  form.privateKey = '';
  form.passphrase = '';
}
</script>

<style scoped>
.panel {
  background: rgba(15, 23, 42, 0.75);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form {
  display: grid;
  gap: 12px;
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
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(30, 41, 59, 0.8);
  color: #f8fafc;
  padding: 8px 10px;
}

.btn {
  margin-top: 8px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #2563eb, #38bdf8);
  border-radius: 8px;
  border: none;
  color: #fff;
  font-weight: 600;
}
</style>
