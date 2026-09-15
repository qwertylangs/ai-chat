import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { api, type Chat, type Message } from '../api'
import { useConversation } from './useConversation'

vi.mock('../api', () => ({
  api: { listMessages: vi.fn(), sendMessage: vi.fn() },
}))
const listMessages = vi.mocked(api.listMessages)
const sendMessage = vi.mocked(api.sendMessage)

const msg = (id: number, role: 'user' | 'assistant', content: string): Message => ({
  id,
  chat_id: 1,
  role,
  content,
  created_at: '2026-01-01T00:00:00Z',
})
const chat = (id: number): Chat => ({ id, title: '', created_at: '2026-01-01T00:00:00Z' })

const scopes: ReturnType<typeof effectScope>[] = []
function setup(overrides: Partial<Parameters<typeof useConversation>[0]> = {}) {
  const deps = {
    activeChatId: ref<number | null>(null),
    error: ref(''),
    consumeFresh: vi.fn(() => false),
    createChat: vi.fn(async () => chat(7)),
    refreshChats: vi.fn(async () => {}),
    ...overrides,
  }
  const scope = effectScope()
  scopes.push(scope)
  return { ...deps, ...scope.run(() => useConversation(deps))! }
}

afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.clearAllMocks()
})

describe('useConversation', () => {
  it('грузит историю при переключении на существующий чат', async () => {
    const { activeChatId, messages } = setup()
    listMessages.mockResolvedValue([msg(1, 'user', 'Привет')])

    activeChatId.value = 5
    await nextTick()
    await vi.waitFor(() => expect(messages.value).toHaveLength(1))

    expect(listMessages).toHaveBeenCalledWith(5)
  })

  it('на только что созданный чат в сеть не идёт и очищает ленту', async () => {
    const consumeFresh = vi.fn(() => true)
    const { activeChatId, messages } = setup({ consumeFresh })
    messages.value = [msg(1, 'user', 'старое')]

    activeChatId.value = 9
    await nextTick()

    expect(messages.value).toEqual([])
    expect(listMessages).not.toHaveBeenCalled()
  })

  it('сброс активного чата в null очищает ленту', async () => {
    const { activeChatId, messages } = setup({ activeChatId: ref<number | null>(3) })
    messages.value = [msg(1, 'user', 'старое')]

    activeChatId.value = null
    await nextTick()

    expect(messages.value).toEqual([])
  })

  it('отдаёт историю последнего выбранного чата, если ответы пришли не по порядку', async () => {
    const { activeChatId, messages } = setup()
    let resolveFirst!: (m: Message[]) => void
    listMessages
      .mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)))
      .mockResolvedValueOnce([msg(2, 'user', 'второй чат')])

    activeChatId.value = 1
    await nextTick()
    activeChatId.value = 2
    await nextTick()
    await vi.waitFor(() => expect(messages.value).toEqual([msg(2, 'user', 'второй чат')]))

    resolveFirst([msg(1, 'user', 'первый чат')]) // опоздавший ответ
    await nextTick()

    expect(messages.value).toEqual([msg(2, 'user', 'второй чат')])
  })

  it('ошибку загрузки истории кладёт в ref', async () => {
    const { activeChatId, error } = setup()
    listMessages.mockRejectedValue(new Error('history down'))

    activeChatId.value = 5
    await nextTick()
    await vi.waitFor(() => expect(error.value).toBe('history down'))
  })

  it('send показывает сообщение пользователя и наполняет ответ ассистента токенами', async () => {
    const { messages, streaming, send } = setup({
      activeChatId: ref<number | null>(1),
    })
    sendMessage.mockImplementation(async (_id, _content, onChunk) => {
      onChunk('При')
      onChunk('вет')
    })
    listMessages.mockResolvedValue([msg(1, 'user', 'Вопрос'), msg(2, 'assistant', 'Привет')])

    await send('Вопрос')

    expect(sendMessage).toHaveBeenCalledWith(1, 'Вопрос', expect.any(Function))
    expect(streaming.value).toBe(false)
    // после стрима лента синхронизируется с сервером
    expect(messages.value).toEqual([msg(1, 'user', 'Вопрос'), msg(2, 'assistant', 'Привет')])
  })

  it('send без активного чата сперва создаёт чат', async () => {
    const createChat = vi.fn(async () => chat(7))
    const { send } = setup({ createChat })
    sendMessage.mockResolvedValue(undefined)
    listMessages.mockResolvedValue([])

    await send('Первый вопрос')

    expect(createChat).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith(7, 'Первый вопрос', expect.any(Function))
  })

  it('после стрима обновляет список чатов — бэкенд мог дать чату название', async () => {
    const refreshChats = vi.fn(async () => {})
    const { send } = setup({ activeChatId: ref<number | null>(1), refreshChats })
    sendMessage.mockResolvedValue(undefined)
    listMessages.mockResolvedValue([])

    await send('Вопрос')

    expect(refreshChats).toHaveBeenCalledOnce()
  })

  it('ошибку отправки кладёт в ref и снимает флаг стрима', async () => {
    const { error, streaming, send } = setup({
      activeChatId: ref<number | null>(1),
    })
    sendMessage.mockRejectedValue(new Error('stream failed'))
    listMessages.mockResolvedValue([])

    await send('Вопрос')

    expect(error.value).toBe('stream failed')
    expect(streaming.value).toBe(false)
  })

  it('send игнорирует пустой ввод и повторный вызов во время стрима', async () => {
    const { send } = setup({ activeChatId: ref<number | null>(1) })

    await send('   ')

    expect(sendMessage).not.toHaveBeenCalled()
  })
})
