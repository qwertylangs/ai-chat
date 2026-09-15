import { computed, ref, type Ref } from 'vue'
import { api, type Chat } from '../api'
import { errorMessage } from '../errors'

/** Список чатов и активный чат: загрузка, выбор, создание и удаление. */
export function useChats(error: Ref<string>, resetSearch: () => void) {
  const chats = ref<Chat[]>([])
  const activeChatId = ref<number | null>(null)
  const activeChat = computed(() =>
    chats.value.find(({ id }) => id === activeChatId.value),
  )

  // Чат, созданный прямо сейчас, заведомо пуст — за его историей в сеть не идём.
  let freshChatId: number | null = null
  function consumeFresh(id: number | null) {
    const fresh = id !== null && id === freshChatId
    freshChatId = null
    return fresh
  }

  async function loadChats() {
    try {
      chats.value = await api.listChats()
    } catch (err) {
      error.value = errorMessage(err)
    }
  }

  async function refreshChats() {
    chats.value = await api.listChats().catch(() => chats.value)
  }

  function selectChat(chatId: number) {
    activeChatId.value = chatId // историю подгрузит useConversation
  }

  async function createChat(): Promise<Chat> {
    const chat = await api.createChat()
    chats.value.unshift(chat)
    freshChatId = chat.id
    activeChatId.value = chat.id
    resetSearch()
    return chat
  }

  async function deleteActiveChat() {
    const chatId = activeChatId.value
    if (chatId === null) return
    try {
      await api.deleteChat(chatId)
    } catch (err) {
      error.value = errorMessage(err)
      return
    }
    chats.value = chats.value.filter((c) => c.id !== chatId)
    activeChatId.value = chats.value[0]?.id ?? null
    resetSearch() // как при создании чата — показываем результат в сайдбаре
  }

  return {
    chats,
    activeChatId,
    activeChat,
    loadChats,
    refreshChats,
    selectChat,
    createChat,
    deleteActiveChat,
    consumeFresh,
  }
}
