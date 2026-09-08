import { ref, watch } from 'vue'

/** Ошибка для баннера, которая сама гаснет через delay мс. */
export function useAutoClearError(delay = 5000) {
  const error = ref('')

  watch(error, (err, _old, onCleanUp) => {
    if (!err) return // сброс баннера не должен взводить новый таймер

    const id = setTimeout(() => {
      error.value = ''
    }, delay)

    onCleanUp(() => clearTimeout(id))
  })

  return { error }
}
