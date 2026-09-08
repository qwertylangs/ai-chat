<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api'
import { useAutoClearError } from '../composables/useAutoClearError'
import { errorMessage } from '../errors'

const emit = defineEmits<{ login: [] }>()

const { error } = useAutoClearError()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'register') {
      await api.register(username.value, password.value)
    }
    await api.login(username.value, password.value)
    emit('login')
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <h1>AI Chat</h1>

      <div class="tabs">
        <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">
          Вход
        </button>
        <button type="button" :class="{ active: mode === 'register' }" @click="mode = 'register'">
          Регистрация
        </button>
      </div>

      <input v-model="username" placeholder="Имя пользователя" autocomplete="username" />

      <input
        v-model="password"
        type="password"
        placeholder="Пароль (мин. 6 символов)"
        autocomplete="current-password"
      />

      <p v-if="error" class="error">{{ error }}</p>

      <button type="submit" class="primary" :disabled="busy">
        {{ mode === 'login' ? 'Войти' : 'Создать аккаунт и войти' }}
      </button>
    </form>
  </div>
</template>