import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getToken, setToken } from './api'

/** Мок fetch: возвращает не-стримовый JSON-ответ. */
function jsonResponse(body: unknown, ok = true, statusText = 'OK') {
  return {
    ok,
    statusText,
    json: () => Promise.resolve(body),
  } as Response
}

/** Мок fetch для sendMessage: тело отдаётся указанными строковыми чанками. */
function streamResponse(chunks: string[], ok = true) {
  const encoder = new TextEncoder()
  let i = 0
  return {
    ok,
    statusText: 'OK',
    json: () => Promise.resolve({ detail: 'boom' }),
    body: {
      getReader: () => ({
        read: () =>
          i < chunks.length
            ? Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) })
            : Promise.resolve({ done: true, value: undefined }),
      }),
    },
  } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('токен', () => {
  it('пишет, читает и удаляет токен', () => {
    expect(getToken()).toBeNull()
    setToken('abc')
    expect(getToken()).toBe('abc')
    setToken(null)
    expect(getToken()).toBeNull()
  })
})

describe('request', () => {
  it('подставляет заголовок Authorization, когда токен есть', async () => {
    setToken('secret')
    fetchMock.mockResolvedValue(jsonResponse([]))

    await api.listChats()

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer secret')
  })

  it('не шлёт Authorization без токена', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))

    await api.listChats()

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('бросает Error с detail из тела при не-2xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'нет доступа' }, false))

    await expect(api.listChats()).rejects.toThrow('нет доступа')
  })

  it('бросает Error со statusText, если тело не парсится', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not json')),
    } as Response)

    await expect(api.listChats()).rejects.toThrow('Bad Gateway')
  })

  it('login сохраняет access_token в localStorage', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'tok-1' }))

    await api.login('user', 'pass')

    expect(getToken()).toBe('tok-1')
  })
})

describe('sendMessage (SSE)', () => {
  it('склеивает delta.content из событий в onChunk', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":{"content":"Привет"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":", мир"}}]}\n\n',
      ]),
    )
    const parts: string[] = []

    await api.sendMessage(1, 'hi', (t) => parts.push(t))

    expect(parts.join('')).toBe('Привет, мир')
  })

  it('собирает событие, разорванное между чтениями', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":',
        '{"content":"склеено"}}]}\n\n',
      ]),
    )
    const parts: string[] = []

    await api.sendMessage(1, 'hi', (t) => parts.push(t))

    expect(parts.join('')).toBe('склеено')
  })

  it('игнорирует data: [DONE] и пустые delta', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    const parts: string[] = []

    await api.sendMessage(1, 'hi', (t) => parts.push(t))

    expect(parts).toEqual([])
  })

  it('бросает Error с detail при event: error', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'event: error\ndata: {"detail":"лимит"}\n\n',
      ]),
    )

    await expect(api.sendMessage(1, 'hi', () => {})).rejects.toThrow('лимит')
  })

  it('бросает Error при не-2xx до стрима', async () => {
    fetchMock.mockResolvedValue(streamResponse([], false))

    await expect(api.sendMessage(1, 'hi', () => {})).rejects.toThrow('boom')
  })
})
