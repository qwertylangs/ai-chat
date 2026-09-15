import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { api, type Chat } from '../api'
import { useChats } from './useChats'

vi.mock('../api', () => ({
  api: { listChats: vi.fn(), createChat: vi.fn(), deleteChat: vi.fn() },
}))
const listChats = vi.mocked(api.listChats)
const createChat = vi.mocked(api.createChat)
const deleteChat = vi.mocked(api.deleteChat)

const chat = (id: number, title: string): Chat => ({
  id,
  title,
  created_at: '2026-01-01T00:00:00Z',
})

const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  const error = ref('')
  const resetSearch = vi.fn()
  const scope = effectScope()
  scopes.push(scope)
  return { error, resetSearch, ...scope.run(() => useChats(error, resetSearch))! }
}

afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.clearAllMocks()
})

describe('useChats', () => {
  it('loadChats наполняет список с бэкенда', async () => {
    const { chats, loadChats } = setup()
    listChats.mockResolvedValue([chat(1, 'Кошки')])

    await loadChats()

    expect(chats.value).toEqual([chat(1, 'Кошки')])
  })

  it('ошибку loadChats кладёт в переданный ref', async () => {
    const { error, loadChats } = setup()
    listChats.mockRejectedValue(new Error('Сеть недоступна'))

    await loadChats()

    expect(error.value).toBe('Сеть недоступна')
  })

  it('createChat добавляет чат в начало, делает активным и сбрасывает поиск', async () => {
    const { chats, activeChatId, resetSearch, createChat: create } = setup()
    chats.value = [chat(1, 'Старый')]
    createChat.mockResolvedValue(chat(2, ''))

    const created = await create()

    expect(created).toEqual(chat(2, ''))
    expect(chats.value).toEqual([chat(2, ''), chat(1, 'Старый')])
    expect(activeChatId.value).toBe(2)
    expect(resetSearch).toHaveBeenCalledOnce()
  })

  it('consumeFresh срабатывает один раз для только что созданного чата', async () => {
    const { consumeFresh, createChat: create } = setup()
    createChat.mockResolvedValue(chat(2, ''))

    await create()

    expect(consumeFresh(2)).toBe(true)
    expect(consumeFresh(2)).toBe(false)
  })

  it('consumeFresh не срабатывает для чужого id', async () => {
    const { consumeFresh, createChat: create } = setup()
    createChat.mockResolvedValue(chat(2, ''))

    await create()

    expect(consumeFresh(1)).toBe(false)
  })

  it('activeChat отражает активный id', () => {
    const { chats, activeChat, selectChat } = setup()
    chats.value = [chat(1, 'Кошки'), chat(2, 'Собаки')]

    selectChat(2)

    expect(activeChat.value).toEqual(chat(2, 'Собаки'))
  })

  it('deleteActiveChat удаляет активный чат и включает верхний из оставшихся', async () => {
    const { chats, activeChatId, resetSearch, selectChat, deleteActiveChat } = setup()
    chats.value = [chat(1, 'Кошки'), chat(2, 'Собаки')]
    selectChat(1)
    deleteChat.mockResolvedValue()

    await deleteActiveChat()

    expect(deleteChat).toHaveBeenCalledWith(1)
    expect(chats.value).toEqual([chat(2, 'Собаки')])
    expect(activeChatId.value).toBe(2)
    expect(resetSearch).toHaveBeenCalledOnce()
  })

  it('deleteActiveChat последнего чата возвращает activeChatId в null', async () => {
    const { chats, activeChatId, selectChat, deleteActiveChat } = setup()
    chats.value = [chat(1, 'Кошки')]
    selectChat(1)
    deleteChat.mockResolvedValue()

    await deleteActiveChat()

    expect(chats.value).toEqual([])
    expect(activeChatId.value).toBeNull()
  })

  it('ошибку deleteActiveChat кладёт в ref и оставляет список нетронутым', async () => {
    const { chats, error, selectChat, deleteActiveChat } = setup()
    chats.value = [chat(1, 'Кошки')]
    selectChat(1)
    deleteChat.mockRejectedValue(new Error('403'))

    await deleteActiveChat()

    expect(error.value).toBe('403')
    expect(chats.value).toEqual([chat(1, 'Кошки')])
  })

  it('refreshChats при ошибке сохраняет текущий список', async () => {
    const { chats, refreshChats } = setup()
    chats.value = [chat(1, 'Кошки')]
    listChats.mockRejectedValue(new Error('offline'))

    await refreshChats()

    expect(chats.value).toEqual([chat(1, 'Кошки')])
  })
})
