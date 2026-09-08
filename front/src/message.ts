import type { Message } from './api'

/** Локальная заготовка сообщения, показываемая до подтверждения с бэкенда. */
export function localMessage(chatId: number, role: 'user' | 'assistant', content: string): Message {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    chat_id: chatId,
    role,
    content,
    created_at: new Date().toISOString(),
  }
}
