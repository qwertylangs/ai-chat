<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAutoClearError } from '../composables/useAutoClearError'
import { useChatSearch } from '../composables/useChatSearch'
import { useChats } from '../composables/useChats'
import { useConversation } from '../composables/useConversation'
import { useTokenUsage } from '../composables/useTokenUsage'
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
const { usage, exhausted, resetsAtLabel, refresh: refreshUsage, setUsage } = useTokenUsage()
const { messages, streaming, send } = useConversation({
  activeChatId,
  error,
  consumeFresh,
  createChat,
  refreshChats,
  refreshUsage,
  setUsage,
})

onMounted(() => {
  loadChats()
  refreshUsage()
})

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
      :usage="usage"
      :exhausted="exhausted"
      :resets-at-label="resetsAtLabel"
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
