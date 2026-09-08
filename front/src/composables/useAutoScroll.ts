import { nextTick, ref } from 'vue'

const STICK_THRESHOLD_PX = 80

/** Прокрутка ленты вниз — с учётом того, что пользователь мог отмотать её сам. */
export function useAutoScroll() {
  const containerEl = ref<HTMLElement | null>(null)

  function isAtBottom() {
    const el = containerEl.value
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
  }

  function scrollToBottom() {
    nextTick(() => {
      const el = containerEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  return { containerEl, isAtBottom, scrollToBottom }
}
