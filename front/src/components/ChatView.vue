<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAutoClearError } from '../composables/useAutoClearError'
import { useChatSearch } from '../composables/useChatSearch'
import { useChats } from '../composables/useChats'
import { useConversation } from '../composables/useConversation'
import ChatSidebar from './ChatSidebar.vue'
import ChatWindow from './ChatWindow.vue'

const emit = defineEmits<{ logout: [] }>()

const { error } = useAutoClearError()
const { search, searchResults, searching } = useChatSearch(error)
const {
  chats,
  activeChatId,
  activeChat,
  loadChats,
  refreshChats,
  selectChat,
  createChat,
  deleteActiveChat,
  consumeFresh,
} = useChats(error, () => {
  search.value = ''
})
const { messages, streaming, send } = useConversation({
  activeChatId,
  error,
  consumeFresh,
  createChat,
  refreshChats,
})

onMounted(loadChats)

const displayedChats = computed(() =>
  search.value.trim() ? searchResults.value : chats.value,
)
const noResults = computed(
  () => !!search.value.trim() && !searching.value && !displayedChats.value.length,
)
</script>

<template>
  <div class="chat-layout">
    <ChatSidebar
      v-model:search="search"
      :chats="displayedChats"
      :active-chat-id="activeChatId"
      :busy="streaming"
      :no-results="noResults"
      @select="selectChat"
      @new-chat="createChat"
      @logout="emit('logout')"
    />

    <ChatWindow
      :active-chat-id="activeChatId"
      :chat-title="activeChat?.title ?? ''"
      :messages="messages"
      :streaming="streaming"
      :error="error"
      @send="send"
      @delete="deleteActiveChat"
    />
  </div>
</template>

<style scoped>
.chat-layout {
  height: 100vh;
  display: flex;
}
</style>
