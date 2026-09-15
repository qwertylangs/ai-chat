import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { api, type Usage } from '../api'
import { useTokenUsage } from './useTokenUsage'

vi.mock('../api', () => ({ api: { getUsage: vi.fn() } }))
const getUsage = vi.mocked(api.getUsage)

// Локальное время: ожидания не зависят от часового пояса машины.
const NOW = new Date(2026, 8, 16, 12, 0)
const usage = (over: Partial<Usage> = {}): Usage => ({
  limit: 1000,
  used: 300,
  remaining: 700,
  resets_at: new Date(2026, 8, 16, 15, 0).toISOString(),
  ...over,
})

const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useTokenUsage())!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useTokenUsage', () => {
  it('refresh загружает статус с сервера', async () => {
    getUsage.mockResolvedValue(usage())
    const { usage: state, refresh } = setup()

    await refresh()

    expect(state.value).toEqual(usage())
  })

  it('exhausted — когда остаток ноль', () => {
    const { exhausted, setUsage } = setup()

    setUsage(usage({ used: 1200, remaining: 0 }))

    expect(exhausted.value).toBe(true)
  })

  it('время сброса сегодня — только часы и минуты', () => {
    const { resetsAtLabel, setUsage } = setup()

    setUsage(usage())

    expect(resetsAtLabel.value).toBe('15:00')
  })

  it('время сброса в другой день — с датой', () => {
    const { resetsAtLabel, setUsage } = setup()

    setUsage(usage({ resets_at: new Date(2026, 8, 17, 3, 0).toISOString() }))

    expect(resetsAtLabel.value).toBe('17 сент., 03:00')
  })

  it('после момента сброса сам перезапрашивает статус', async () => {
    const { setUsage } = setup()
    getUsage.mockResolvedValue(usage({ used: 0, remaining: 1000 }))

    setUsage(usage({ resets_at: new Date(NOW.getTime() + 60_000).toISOString() }))
    await vi.advanceTimersByTimeAsync(59_000)
    expect(getUsage).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(getUsage).toHaveBeenCalledOnce()
  })

  it('ошибку загрузки глотает — счётчик вторичен', async () => {
    getUsage.mockRejectedValue(new Error('down'))
    const { usage: state, refresh } = setup()

    await expect(refresh()).resolves.toBeUndefined()
    expect(state.value).toBeNull()
  })
})
