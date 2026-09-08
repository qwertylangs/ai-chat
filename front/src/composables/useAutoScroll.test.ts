import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useAutoScroll } from './useAutoScroll'

/** Элемент с заданной геометрией: happy-dom не считает layout сам. */
function element(geometry: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  const el = document.createElement('div')
  Object.defineProperties(el, {
    scrollHeight: { value: geometry.scrollHeight },
    clientHeight: { value: geometry.clientHeight },
    scrollTop: { value: geometry.scrollTop, writable: true },
  })
  return el
}

describe('useAutoScroll', () => {
  it('прокручивает контейнер вниз после обновления DOM', async () => {
    const { containerEl, scrollToBottom } = useAutoScroll()
    containerEl.value = element({ scrollHeight: 1000, clientHeight: 300, scrollTop: 0 })

    scrollToBottom()
    expect(containerEl.value.scrollTop).toBe(0) // ждём nextTick, DOM ещё не готов

    await nextTick()
    expect(containerEl.value.scrollTop).toBe(1000)
  })

  it('считает низом позицию в пределах порога', () => {
    const { containerEl, isAtBottom } = useAutoScroll()

    containerEl.value = element({ scrollHeight: 1000, clientHeight: 300, scrollTop: 700 })
    expect(isAtBottom()).toBe(true)

    containerEl.value = element({ scrollHeight: 1000, clientHeight: 300, scrollTop: 660 })
    expect(isAtBottom()).toBe(true) // 40px от низа — всё ещё «прилипли»

    containerEl.value = element({ scrollHeight: 1000, clientHeight: 300, scrollTop: 500 })
    expect(isAtBottom()).toBe(false)
  })

  it('без смонтированного контейнера считает, что мы внизу', () => {
    const { isAtBottom, scrollToBottom } = useAutoScroll()

    expect(isAtBottom()).toBe(true)
    expect(() => scrollToBottom()).not.toThrow()
  })
})
