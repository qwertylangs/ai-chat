<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import type { Chat, Message } from '../api'

const emit = defineEmits<{ logout: [] }>()

const chats = ref<Chat[]>([])
const activeChatId = ref<number | null>(null)
const messages = ref<Message[]>([])
const input = ref('')
const streaming = ref(false)
const error = ref('')
const messagesEl = ref<HTMLElement | null>(null)
const search = ref('')

const canSend = computed(() => {
  const content = input.value.trim()
  if (!content || streaming.value) return false

  return true
})

const activeChatTitle = computed(() => {
  if (!activeChatId) return ''

  return chats.value.find(({id}) => id === activeChatId.value)?.title
})

const filteredChats = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return chats.value

  return chats.value.filter((chat) => chat.title.toLowerCase().includes(query))
})

watch(activeChatId, async (id) => {
  if (!id) return;
  messages.value = await api.listMessages(id)
})

watch(error, (_err, _oldErr, onCleanUp) => {
  const id = setTimeout(() => {
    error.value = ''
  })

  onCleanUp(() => clearTimeout(id))
})

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** Прилипаем к низу, только пока пользователь не отмотал ленту вверх сам. */
function isAtBottom() {
  const el = messagesEl.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

onMounted(async () => {
  try {
    chats.value = await api.listChats()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error'
  }
})

async function selectChat(chatId: number) {
  if (streaming.value || chatId === activeChatId.value) return
  activeChatId.value = chatId
  scrollToBottom()
}

async function createNewChat() {
  if (streaming.value) return
  const chat = await api.createChat()
  chats.value.unshift(chat)
  activeChatId.value = chat.id
  messages.value = []
  search.value = ''
}

/** Первый же вопрос создаёт чат автоматически (название присвоит бэкенд). */
async function send() {
  const content = input.value.trim()
  if (!canSend.value) return
  error.value = ''
  input.value = ''

  let chatId = activeChatId.value
  try {
    if (chatId === null) {
      const chat = await api.createChat()
      chats.value.unshift(chat)
      chatId = chat.id
      activeChatId.value = chatId
      search.value = ''
    }

    // Локально показываем сообщение пользователя и пустого ассистента.
    // Пустая заготовка наполняется токенами по мере стрима.
    messages.value.push(localMessage(chatId, 'user', content))
    const assistantIndex = messages.value.push(localMessage(chatId, 'assistant', '')) - 1

    streaming.value = true
    scrollToBottom()
    await api.sendMessage(chatId, content, (chunk) => {
      const stick = isAtBottom()
      messages.value[assistantIndex].content += chunk
      if (stick) scrollToBottom()
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error'
  } finally {
    streaming.value = false
    // Синхронизируемся с БД: ассистентское сообщение теперь сохранено сервером,
    // чат мог получить название от бэкенда.
    if (activeChatId.value !== null) {
      messages.value = await api
        .listMessages(activeChatId.value)
        .catch(() => messages.value)
      chats.value = await api.listChats().catch(() => chats.value)
    }
  }
}

function localMessage(chatId: number, role: 'user' | 'assistant', content: string): Message {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    chat_id: chatId,
    role,
    content,
    created_at: new Date().toISOString(),
  }
}
</script>

<template>
  <div class="chat-layout">
    <aside class="sidebar">
      <button class="new-chat" :disabled="streaming" @click="createNewChat">
        ＋ Новый чат
      </button>

      <input v-model="search" placeholder="Поиск по чатам" />

      <p v-if="search.trim() && !filteredChats.length" class="no-results">
        Ничего не найдено
      </p>

      <ul class="chat-list">
        <li v-for="chat in filteredChats" :key="chat.id">
          <button
            :class="{ active: chat.id === activeChatId }"
            :disabled="streaming"
            @click="selectChat(chat.id)"
          >
            {{ chat.title }}
          </button>
        </li>
      </ul>

      <button class="logout" @click="emit('logout')">Выйти</button>
    </aside>

    <main class="chat-main">
      <p v-if="activeChatTitle" class="chat-title">{{ activeChatTitle }}</p>

      <p v-if="error" class="error-banner">{{ error }}</p>

      <div v-if="activeChatId === null" class="empty-state">
        <p class="hint">Напишите первое сообщение — чат создастся автоматически</p>
      </div>

      <div v-else ref="messagesEl" class="messages">
        <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
          <div class="bubble">{{ msg.content }}</div>
        </div>
        <div v-if="streaming" class="cursor" />
      </div>

      <form class="composer" @submit.prevent="send">
        <input
          v-model="input"
          :disabled="streaming"
          placeholder="Сообщение… (Enter — отправить)"
        />
        <button type="submit" :disabled="!canSend">➤</button>
      </form>
    </main>
  </div>
</template>