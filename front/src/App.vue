<script setup lang="ts">
import { ref } from 'vue'
import AuthView from './components/AuthView.vue'
import ChatView from './components/ChatView.vue'
import { getToken, setToken } from './api'

const token = ref<string | null>(getToken())

function onLogin() {
  token.value = getToken() // api.login уже положил токен в localStorage
}

function onLogout() {
  setToken(null)
  token.value = null
}
</script>

<template>
  <AuthView v-if="!token" @login="onLogin" />
  <ChatView v-else @logout="onLogout" />
</template>