import { describe, expect, it } from 'vitest'
import { localMessage } from './message'

describe('localMessage', () => {
  it('заполняет роль, чат и текст как есть', () => {
    const msg = localMessage(5, 'user', 'Привет')

    expect(msg.chat_id).toBe(5)
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Привет')
  })

  it('даёт валидный ISO-таймстамп создания', () => {
    const msg = localMessage(1, 'assistant', '')

    expect(() => new Date(msg.created_at).toISOString()).not.toThrow()
  })

  it('id разных сообщений не совпадают', () => {
    const ids = Array.from({ length: 20 }, () => localMessage(1, 'user', 'x').id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
