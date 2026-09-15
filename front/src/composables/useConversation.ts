import { ref, watch, type Ref } from 'vue'
import { api, type Chat, type Message } from '../api'
import { errorMessage } from '../errors'
import { localMessage } from '../message'

interface Deps {
  activeChatId: Ref<number | null>
  error: Ref<string>
  consumeFresh: (id: number | null) => boolean
  createChat: () => Promise<Chat>
  refreshChats: () => Promise<void>
}

/** Лента активного чата: загрузка истории и отправка сообщения со стримом ответа. */
export function useConversation({ activeChatId, error, consumeFresh, createChat, refreshChats }: Deps) {
  const messages = ref<Message[]>([])
  const streaming = ref(false)

  watch(activeChatId, async (id, _old, onCleanUp) => {
    if (id === null || consumeFresh(id)) {
      messages.value = []
      return
    }

    let stale = false // пока грузим, чат могли переключить ещё раз
    onCleanUp(() => {
      stale = true
    })

    try {
      const loaded = await api.listMessages(id)
      if (!stale) messages.value = loaded
    } catch (err) {
      if (!stale) error.value = errorMessage(err)
    }
  })

  /** Первый же вопрос создаёт чат автоматически (название присвоит бэкенд). */
  async function send(content: string) {
    const text = content.trim()
    if (!text || streaming.value) return
    error.value = ''

    try {
      const chatId = activeChatId.value ?? (await createChat()).id

      // Локально показываем сообщение пользователя и пустого ассистента,
      // пустая заготовка наполняется токенами по мере стрима.
      messages.value.push(localMessage(chatId, 'user', text))
      const assistantIndex = messages.value.push(localMessage(chatId, 'assistant', '')) - 1

      streaming.value = true
      await api.sendMessage(chatId, text, (chunk) => {
        messages.value[assistantIndex].content += chunk
      })
    } catch (err) {
      error.value = errorMessage(err)
    } finally {
      streaming.value = false
      // Синхронизируемся с БД: ответ ассистента сохранён сервером, чат мог получить название.
      if (activeChatId.value !== null) {
        messages.value = await api
          .listMessages(activeChatId.value)
          .catch(() => messages.value)
        await refreshChats()
      }
    }
  }

  return { messages, streaming, send }
}
