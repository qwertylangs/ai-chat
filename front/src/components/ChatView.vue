<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import type { Chat, Message } from '../api'
import { useAutoClearError } from '../composables/useAutoClearError'
import { useAutoScroll } from '../composables/useAutoScroll'
import { useChatSearch } from '../composables/useChatSearch'
import { errorMessage } from '../errors'
import { localMessage } from '../message'

const emit = defineEmits<{ logout: [] }>()

const { error } = useAutoClearError()
const { search, searchResults, searching } = useChatSearch(error)
const { containerEl: messagesEl, isAtBottom, scrollToBottom } = useAutoScroll()

const chats = ref<Chat[]>([])
const activeChatId = ref<number | null>(null)
const messages = ref<Message[]>([])
const input = ref('')
const streaming = ref(false)

const canSend = computed(() => !!input.value.trim() && !streaming.value)

const activeChat = computed(() =>
  chats.value.find(({ id }) => id === activeChatId.value),
)

const displayedChats = computed(() =>
  search.value.trim() ? searchResults.value : chats.value,
)

// Чат, созданный прямо сейчас, заведомо пуст — за его историей в сеть не идём.
let freshChatId: number | null = null

watch(activeChatId, async (id, _oldId, onCleanUp) => {
  const isFresh = id === freshChatId
  freshChatId = null
  if (id === null || isFresh) return

  let stale = false // пока грузим, чат могли переключить ещё раз
  onCleanUp(() => {
    stale = true
  })

  try {
    const loaded = await api.listMessages(id)
    if (stale) return
    messages.value = loaded
    scrollToBottom()
  } catch (err) {
    if (!stale) error.value = errorMessage(err)
  }
})

onMounted(async () => {
  try {
    chats.value = await api.listChats()
  } catch (err) {
    error.value = errorMessage(err)
  }
})

async function selectChat(chatId: number) {
  if (streaming.value || chatId === activeChatId.value) return
  activeChatId.value = chatId // историю подгрузит watch, он же прокрутит вниз
}

async function deleteActiveChat() {
  const chatId = activeChatId.value
  if (chatId === null || streaming.value) return
  if (!window.confirm('Удалить чат?')) return
  try {
    await api.deleteChat(chatId)
  } catch (err) {
    error.value = errorMessage(err)
    return
  }
  chats.value = chats.value.filter((c) => c.id !== chatId)
  activeChatId.value = chats.value[0]?.id ?? null
  if (activeChatId.value === null) messages.value = []
  search.value = '' // как при создании чата — показываем результат в сайдбаре
}

/** Заводит чат на бэкенде и делает его активным — общий шаг для явного создания и автосоздания в send(). */
async function createChat(): Promise<Chat> {
  const chat = await api.createChat()
  chats.value.unshift(chat)
  freshChatId = chat.id
  activeChatId.value = chat.id
  search.value = ''
  return chat
}

async function createNewChat() {
  if (streaming.value) return
  await createChat()
  messages.value = []
}

/** Первый же вопрос создаёт чат автоматически (название присвоит бэкенд). */
async function send() {
  const content = input.value.trim()
  if (!canSend.value) return
  error.value = ''
  input.value = ''

  try {
    const chatId = activeChatId.value ?? (await createChat()).id

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
    error.value = errorMessage(err)
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
</script>

<template>
  <div class="chat-layout">
    <aside class="sidebar">
      <button class="new-chat" :disabled="streaming" @click="createNewChat">
        ＋ Новый чат
      </button>

      <input v-model="search" placeholder="Поиск по чатам" />

      <p
        v-if="search.trim() && !searching && !displayedChats.length"
        class="no-results"
      >
        Ничего не найдено
      </p>

      <ul class="chat-list">
        <li v-for="chat in displayedChats" :key="chat.id">
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
      <header v-if="activeChat?.title" class="chat-title">
        <button
          class="delete-chat"
          :disabled="streaming"
          aria-label="Удалить чат"
          title="Удалить чат"
          @click="deleteActiveChat"
        >
          <span aria-hidden="true">🗑</span>
        </button>
        <span>{{ activeChat.title }}</span>
      </header>

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