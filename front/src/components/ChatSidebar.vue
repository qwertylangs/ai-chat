<script setup lang="ts">
import type { Chat } from '../api'
import ChatSearch from './ChatSearch.vue'

defineProps<{
  chats: Chat[]
  activeChatId: number | null
  busy: boolean
  noResults: boolean
}>()

defineEmits<{ select: [chatId: number]; 'new-chat': []; logout: [] }>()

const query = defineModel<string>('search', { required: true })
</script>

<template>
  <aside class="sidebar">
    <button class="new-chat" :disabled="busy" @click="$emit('new-chat')">
      ＋ Новый чат
    </button>

    <ChatSearch v-model="query" :no-results="noResults" />

    <ul class="chat-list">
      <li v-for="chat in chats" :key="chat.id">
        <button
          :class="{ active: chat.id === activeChatId }"
          :disabled="busy"
          @click="$emit('select', chat.id)"
        >
          {{ chat.title }}
        </button>
      </li>
    </ul>

    <button class="logout" @click="$emit('logout')">Выйти</button>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.new-chat {
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.new-chat:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.chat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-list button {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-list button:hover {
  background: var(--bg);
  color: var(--text);
}

.chat-list button.active {
  background: var(--accent);
  color: #fff;
}

.logout {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.logout:hover {
  color: #ff6b6b;
  border-color: #ff6b6b;
}
</style>
