import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useAutoClearError } from './useAutoClearError'

/** Composable живёт в своём scope, чтобы watch не пережил тест. */
function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(fn) as T
}
const scopes: ReturnType<typeof effectScope>[] = []

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
})

describe('useAutoClearError', () => {
  it('гасит ошибку через заданную задержку', async () => {
    const { error } = withScope(() => useAutoClearError(5000))

    error.value = 'boom'
    await nextTick()

    vi.advanceTimersByTime(4999)
    expect(error.value).toBe('boom')

    vi.advanceTimersByTime(1)
    expect(error.value).toBe('')
  })

  it('новая ошибка перезапускает отсчёт, а не наслаивает таймеры', async () => {
    const { error } = withScope(() => useAutoClearError(5000))

    error.value = 'первая'
    await nextTick()
    vi.advanceTimersByTime(3000)

    error.value = 'вторая'
    await nextTick()
    vi.advanceTimersByTime(3000) // 6000 от первой, 3000 от второй

    expect(error.value).toBe('вторая')

    vi.advanceTimersByTime(2000)
    expect(error.value).toBe('')
  })

  it('сброс ошибки не взводит новый таймер', async () => {
    const { error } = withScope(() => useAutoClearError(5000))

    error.value = ''
    await nextTick()

    expect(vi.getTimerCount()).toBe(0)
  })
})
