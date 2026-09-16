import { computed, onScopeDispose, ref } from 'vue'
import { api, type Usage } from '../api'

const MAX_TIMEOUT_MS = 2 ** 31 - 1 // больше — setTimeout срабатывает сразу
const RESET_GRACE_MS = 1000 // запас на расхождение часов клиента и сервера
const RETRY_MS = 30_000 // повтор, если обновление не удалось

function formatResetsAt(resetsAt: Date, now: Date): string {
  const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  return resetsAt.toDateString() === now.toDateString()
    ? resetsAt.toLocaleTimeString('ru-RU', time)
    : resetsAt.toLocaleString('ru-RU', { day: 'numeric', month: 'short', ...time })
}

/** Остаток лимита токенов; сам обновляется, когда окно лимита сбрасывается. */
export function useTokenUsage() {
  const usage = ref<Usage | null>(null)
  const exhausted = computed(() => usage.value?.remaining === 0)
  const resetsAtLabel = computed(() =>
    usage.value ? formatResetsAt(new Date(usage.value.resets_at), new Date()) : '',
  )

  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function setUsage(next: Usage) {
    usage.value = next
    clearTimeout(timer)
    if (disposed) return
    const delay = new Date(next.resets_at).getTime() - Date.now() + RESET_GRACE_MS
    timer = setTimeout(refresh, Math.min(Math.max(delay, RESET_GRACE_MS), MAX_TIMEOUT_MS))
  }

  async function refresh() {
    try {
      const next = await api.getUsage()
      if (disposed) return
      setUsage(next)
    } catch {
      // lazy: счётчик вторичен — молча повторяем; показать ошибку, если пользователи начнут жаловаться на устаревший остаток
      if (disposed) return
      clearTimeout(timer)
      timer = setTimeout(refresh, RETRY_MS)
    }
  }

  onScopeDispose(() => {
    disposed = true
    clearTimeout(timer)
  })

  return { usage, exhausted, resetsAtLabel, refresh, setUsage }
}
