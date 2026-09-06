export interface User {
  id: number
  username: string
}

export interface Chat {
  id: number
  title: string
  created_at: string
}

export interface Message {
  id: number
  chat_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

const TOKEN_KEY = 'ai_chat_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

export const api = {
  register(username: string, password: string) {
    return request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  async login(username: string, password: string) {
    const data = await request<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setToken(data.access_token)
  },

  listChats() {
    return request<Chat[]>('/api/chats')
  },

  /** Поиск по названию и содержимому чатов; каждое слово запроса должно совпасть. */
  searchChats(q: string) {
    return request<Chat[]>(`/api/chats/search?q=${encodeURIComponent(q)}`)
  },

  createChat(title?: string) {
    return request<Chat>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  },

  listMessages(chatId: number) {
    return request<Message[]>(`/api/chats/${chatId}/messages`)
  },

  /**
   * Отправляет сообщение и стримит ответ по SSE.
   * onChunk вызывается с каждым фрагментом текста ответа.
   * Бросает Error, если сервер прислал event: error или ответ не-2xx.
   */
  async sendMessage(
    chatId: number,
    content: string,
    onChunk: (text: string) => void,
  ): Promise<void> {
    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ content }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(body.detail ?? 'Request failed')
    }

    // Парсим SSE: события разделяются пустой строкой, данные — строкой "data: ...".
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        let error: Error | null = null
        let data: unknown = null

        for (const line of event.split('\n')) {
          if (line.startsWith('event: error')) {
            error = new Error('Stream error')
          } else if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            data = JSON.parse(line.slice(6))
          }
        }

        if (error) {
          const detail = (data as { detail?: string } | null)?.detail
          throw new Error(detail ?? error.message)
        }
        if (data) {
          const choices = (data as {
            choices?: Array<{ delta?: { content?: string | null } }>
          }).choices
          const content = choices?.[0]?.delta?.content
          if (content) onChunk(content)
        }
      }
    }
  },
}