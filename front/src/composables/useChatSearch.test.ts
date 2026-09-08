import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { api, type Chat } from '../api'
import { useChatSearch } from './useChatSearch'

vi.mock('../api', () => ({ api: { searchChats: vi.fn() } }))
const searchChats = vi.mocked(api.searchChats)

const chat = (id: number, title: string): Chat =>
  ({ id, title, created_at: '2026-01-01T00:00:00Z' }) as Chat

const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  const error = ref('')
  const scope = effectScope()
  scopes.push(scope)
  return { error, ...scope.run(() => useChatSearch(error))! }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
  searchChats.mockReset()
})

describe('useChatSearch', () => {
  it('не дёргает бэкенд, пока пользователь печатает', async () => {
    const { search } = setup()
    searchChats.mockResolvedValue([chat(1, 'Кошки')])

    search.value = 'ко'
    await nextTick()
    search.value = 'кош'
    await nextTick()
    vi.advanceTimersByTime(249)

    expect(searchChats).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(searchChats).toHaveBeenCalledTimes(1)
    expect(searchChats).toHaveBeenCalledWith('кош')
  })

  it('отдаёт результат последнего запроса, даже если ответы пришли не по порядку', async () => {
    const { search, searchResults } = setup()
    let resolveFirst!: (chats: Chat[]) => void
    searchChats
      .mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)))
      .mockResolvedValueOnce([chat(2, 'Собаки')])

    search.value = 'кошки'
    await nextTick()
    vi.advanceTimersByTime(250)

    search.value = 'собаки'
    await nextTick()
    vi.advanceTimersByTime(250)
    await vi.waitFor(() => expect(searchResults.value).toEqual([chat(2, 'Собаки')]))

    resolveFirst([chat(1, 'Кошки')]) // опоздавший ответ первого запроса
    await nextTick()

    expect(searchResults.value).toEqual([chat(2, 'Собаки')])
  })

  it('очистка запроса сбрасывает результаты и не идёт в сеть', async () => {
    const { search, searchResults, searching } = setup()
    searchChats.mockResolvedValue([chat(1, 'Кошки')])

    search.value = 'кошки'
    await nextTick()
    vi.advanceTimersByTime(250)
    await vi.waitFor(() => expect(searchResults.value).toHaveLength(1))

    search.value = '   '
    await nextTick()
    vi.advanceTimersByTime(250)

    expect(searchResults.value).toEqual([])
    expect(searching.value).toBe(false)
    expect(searchChats).toHaveBeenCalledTimes(1)
  })

  it('ошибку поиска кладёт в переданный ref', async () => {
    const { search, error, searching } = setup()
    searchChats.mockRejectedValue(new Error('Сеть недоступна'))

    search.value = 'кошки'
    await nextTick()
    vi.advanceTimersByTime(250)
    await vi.waitFor(() => expect(error.value).toBe('Сеть недоступна'))

    expect(searching.value).toBe(false)
  })
})
