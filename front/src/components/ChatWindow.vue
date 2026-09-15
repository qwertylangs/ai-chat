<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Message, Usage } from '../api'
import { useAutoScroll } from '../composables/useAutoScroll'

const props = defineProps<{
  activeChatId: number | null
  chatTitle: string
  messages: Message[]
  streaming: boolean
  error: string
  usage: Usage | null
  exhausted: boolean
  resetsAtLabel: string
}>()

const emit = defineEmits<{ send: [content: string]; delete: [] }>()

const input = ref('')
const canSend = computed(() => !!input.value.trim() && !props.streaming && !props.exhausted)

const { containerEl: messagesEl, isAtBottom, scrollToBottom } = useAutoScroll()

// Липнем к низу ленты: при загрузке нового чата (сменилась ссылка на массив)
// и при стриме ответа — если пользователь сам не отмотал ленту вверх.
watch(
  () => props.messages,
  (now, prev) => {
    if (now !== prev || isAtBottom()) scrollToBottom()
  },
  { deep: true },
)

function submit() {
  if (!canSend.value) return
  const content = input.value
  input.value = ''
  emit('send', content)
}

function remove() {
  if (props.streaming) return
  if (window.confirm('Удалить чат?')) emit('delete')
}
</script>

<template>
  <main class="chat-main">
    <header v-if="chatTitle" class="chat-title">
      <button
        class="delete-chat"
        :disabled="streaming"
        aria-label="Удалить чат"
        title="Удалить чат"
        @click="remove"
      >
        <span aria-hidden="true">🗑</span>
      </button>
      <span>{{ chatTitle }}</span>
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

    <form class="composer" @submit.prevent="submit">
      <input
        v-model="input"
        :disabled="streaming || exhausted"
        placeholder="Сообщение… (Enter — отправить)"
      />
      <button type="submit" :disabled="!canSend">➤</button>
    </form>

    <p v-if="exhausted" class="limit-banner" role="status">
      Лимит токенов исчерпан. Новые сообщения можно отправить после {{ resetsAtLabel }}
    </p>
    <p v-else-if="usage" class="usage-line">
      Осталось {{ usage.remaining }} из {{ usage.limit }} токенов · сброс в {{ resetsAtLabel }}
    </p>
  </main>
</template>

<style scoped>
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-title {
  height: 50px;
  background-color: var(--panel);
  margin: 0;
  padding: 0 16px;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-title > span {
  min-width: 0; /* иначе flex-элемент не ужимается и длинный заголовок ломает вёрстку */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-chat {
  flex-shrink: 0;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  opacity: 0.6;
}

.delete-chat:hover {
  opacity: 1;
}

.delete-chat:disabled {
  opacity: 0.3;
  cursor: default;
}

.error-banner {
  margin: 12px 12px 0;
  padding: 10px 12px;
  background: #3a1f22;
  border: 1px solid #6b2d33;
  color: #ffb4b4;
  border-radius: 8px;
  font-size: 13px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hint {
  color: var(--muted);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message {
  display: flex;
}

.message.user {
  justify-content: flex-end;
}

.message.assistant {
  justify-content: flex-start;
}

.bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
}

.message.user .bubble {
  background: var(--user-bubble);
  border-bottom-right-radius: 4px;
}

.message.assistant .bubble {
  background: var(--assistant-bubble);
  border-bottom-left-radius: 4px;
}

.cursor {
  width: 8px;
  height: 16px;
  background: var(--accent);
  border-radius: 2px;
  animation: blink 1s infinite;
  align-self: flex-start;
  margin-left: 4px;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.composer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.composer input {
  flex: 1;
}

.composer button {
  width: 44px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}

.usage-line {
  margin: 0;
  padding: 0 16px 10px;
  font-size: 12px;
  color: var(--muted);
}

.limit-banner {
  margin: 0 16px 12px;
  padding: 10px 12px;
  background: #3a2f1f;
  border: 1px solid #6b5a2d;
  color: #ffd9a0;
  border-radius: 8px;
  font-size: 13px;
}
</style>
