import { ref, watch, type Ref } from 'vue'
import { api, type Chat } from '../api'
import { errorMessage } from '../errors'

const DEBOUNCE_MS = 250

/** Поиск чатов по строке запроса: дебаунс ввода и отбрасывание опоздавших ответов. */
export function useChatSearch(error: Ref<string>) {
  const search = ref('')
  const searchResults = ref<Chat[]>([])
  const searching = ref(false)

  watch(search, (value, _old, onCleanUp) => {
    const query = value.trim()
    if (!query) {
      searching.value = false
      searchResults.value = []
      return
    }

    let stale = false // запрос устарел: пользователь успел изменить строку
    onCleanUp(() => {
      stale = true
      clearTimeout(timer)
    })

    searching.value = true
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchChats(query)
        if (!stale) searchResults.value = results
      } catch (err) {
        if (!stale) error.value = errorMessage(err)
      } finally {
        if (!stale) searching.value = false
      }
    }, DEBOUNCE_MS)
  })

  return { search, searchResults, searching }
}
