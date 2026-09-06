# Поиск по чатам — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в сайдбар поле поиска, фильтрующее список чатов по вхождению подстроки в название без учёта регистра.

**Architecture:** Локальное состояние `search` в `ChatView.vue` и производный `computed`-список, по которому рендерится сайдбар. Данные уже целиком на клиенте, поэтому фильтр не делает сетевых запросов и не трогает бэкенд.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), TypeScript, Playwright (e2e со стабом OpenRouter).

**Spec:** `docs/superpowers/specs/2026-09-06-chat-search-design.md`

## Global Constraints

- Тексты в UI — на русском, ровно как в спеке: плейсхолдер `Поиск по чатам`, строка пустого результата `Ничего не найдено`.
- Поиск не делает HTTP-запросов: никаких новых методов в `front/src/api.ts` и никаких изменений в `api/`.
- Новых зависимостей не добавлять (ни fuse.js, ни Vitest).
- Порядок чатов задаёт бэкенд (свежие сверху); фильтр только убирает элементы, не сортирует.
- Разработка по TDD: тест пишется первым и должен упасть по правильной причине, потом минимальная реализация.
- Существующий `e2e/tests/chat.spec.ts` обязан остаться зелёным.
- `git commit` выполняет только основная сессия после подтверждения пользователя. Субагенты git не вызывают: в рабочем дереве уже лежит незакоммиченный рефакторинг `ChatView.vue`, который не относится к этой фиче.

## Стенд

Все команды — из `/Users/egor/learn/ai-chat`. Playwright сам поднимает стаб OpenRouter (8931), бэкенд (8001, отдельная БД) и vite dev (5174), ничего запускать руками не нужно.

- Прогон только новых тестов: `cd e2e && npx playwright test tests/search.spec.ts`
- Полный прогон e2e: `cd e2e && npx playwright test`
- Проверка типов и сборка фронта: `cd front && npm run build`

## File Structure

- `e2e/tests/search.spec.ts` — **создаётся**. Единственный файл с тестами фичи: общий `beforeEach` (регистрация + два чата с известными названиями) и по одному тесту на поведение.
- `front/src/components/ChatView.vue` — **изменяется**. Состояние `search`, `computed`-фильтр, поле ввода и строка пустого результата в разметке, сброс запроса при создании чата.
- `front/src/style.css` — **изменяется**. Одно правило `.no-results`.

Больше файлов задача не трогает.

## Контекст для исполнителя

`ChatView.vue` устроен так (значимое для задачи):

- `const chats = ref<Chat[]>([])` — список чатов, заполняется в `onMounted` из `api.listChats()` и перезаписывается после каждого стрима в `finally` внутри `send()`.
- `Chat` (`front/src/api.ts`) — `{ id: number; title: string; created_at: string }`.
- Сайдбар рендерит `<ul class="chat-list">` с `v-for="chat in chats"`; кнопки чатов заблокированы во время стрима (`:disabled="streaming"`).
- Чат создаётся в двух местах: `createNewChat()` (кнопка `＋ Новый чат`) и ветка `if (chatId === null)` внутри `send()` (автосоздание при первом сообщении). Оба делают `chats.value.unshift(chat)`.
- Название нового чата — `Новый чат`; бэкенд заменяет его на первые 50 символов первого сообщения пользователя.

Про тесты:

- Стаб OpenRouter всегда отвечает строкой `Это ответ стаба OpenRouter.` (см. `e2e/fake_openrouter.py`), поэтому конца стрима можно дождаться проверкой текста ассистентского пузыря.
- В сайдбаре кнопку `＋ Новый чат` адресуем через `page.locator('.new-chat')`, а **не** через `getByRole('button', { name: 'Новый чат' })`: у только что созданного чата такое же название, и ролевой локатор станет неоднозначным (strict mode violation).
- `createNewChat()` асинхронна (`await api.createChat()`), а `click()` в Playwright возвращается сразу после диспатча события. Отправлять сообщение сразу после клика нельзя: чат ещё не переключился, и сообщение уйдёт в предыдущий. Поэтому клик всегда сопровождается ожиданием `expect(page.locator('.message')).toHaveCount(0)` — лента очищается ровно тогда, когда новый чат стал активным.
- `getByPlaceholder` и `getByRole(..., { name })` в Playwright по умолчанию ищут подстроку без учёта регистра, поэтому `getByPlaceholder('Сообщение')` попадает в поле с плейсхолдером `Сообщение… (Enter — отправить)`.

---

### Task 1: Фильтрация списка чатов и пустой результат

Закрывает критерии приёмки 1–5, 7, 8.

Критерии 7 (поле активно во время стрима) и 8 (нет сетевых запросов) тестом не
покрываются и проверяются на ревью по диффу: стаб отвечает мгновенно, поэтому
ловить момент стрима — флейк, а «отсутствие запроса» проще увидеть в коде, чем
сторожить в браузере.

**Files:**
- Create: `e2e/tests/search.spec.ts`
- Modify: `front/src/components/ChatView.vue`
- Modify: `front/src/style.css`

**Interfaces:**
- Consumes: `chats: Ref<Chat[]>` и `streaming: Ref<boolean>` — уже существуют в `ChatView.vue`.
- Produces: `search: Ref<string>` и `filteredChats: ComputedRef<Chat[]>` в `ChatView.vue`. Task 2 сбрасывает `search` и опирается ровно на эти имена. В `e2e/tests/search.spec.ts` — хелпер `send(page, text)` и общий `test.beforeEach`, которые Task 2 переиспользует.

- [ ] **Step 1: Написать падающие тесты**

Создать `e2e/tests/search.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

const STUB_REPLY = 'Это ответ стаба OpenRouter.' // держать в согласии с fake_openrouter.py

async function register(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByPlaceholder('Имя пользователя').fill(`user_${Date.now()}`)
  await page.getByPlaceholder('Пароль').fill('password123')
  await page.getByRole('button', { name: 'Создать аккаунт и войти' }).click()
}

/** Отправляет сообщение в активный чат и дожидается конца стрима. */
async function send(page: Page, text: string) {
  const composer = page.getByPlaceholder('Сообщение')
  await composer.fill(text)
  await composer.press('Enter')
  await expect(page.locator('.message.assistant .bubble').last()).toHaveText(STUB_REPLY)
}

/** Создаёт чат кнопкой и ждёт, пока он станет активным: createNewChat() асинхронна. */
async function newChat(page: Page) {
  await page.locator('.new-chat').click()
  await expect(page.locator('.message')).toHaveCount(0)
}

test('у пользователя без чатов строки «Ничего не найдено» нет', async ({ page }) => {
  await register(page)

  await expect(page.getByPlaceholder('Поиск по чатам')).toBeVisible()
  await expect(page.getByText('Ничего не найдено')).toBeHidden()
})

test.describe('со списком чатов', () => {
  // Название чату даёт бэкенд по первому сообщению, поэтому чаты «заводим» перепиской.
  test.beforeEach(async ({ page }) => {
    await register(page)
    await send(page, 'Кошки')
    await newChat(page)
    await send(page, 'Собаки')

    await expect(page.locator('.chat-list li')).toHaveCount(2)
  })

  test('фильтрует чаты по подстроке без учёта регистра и пробелов', async ({ page }) => {
    await page.getByPlaceholder('Поиск по чатам').fill('  КоШ  ')

    await expect(page.locator('.chat-list li')).toHaveCount(1)
    await expect(page.locator('.chat-list li')).toHaveText('Кошки')
  })

  test('возвращает весь список, когда запрос очищен', async ({ page }) => {
    const search = page.getByPlaceholder('Поиск по чатам')
    await search.fill('кош')
    await expect(page.locator('.chat-list li')).toHaveCount(1)

    await search.fill('')

    await expect(page.locator('.chat-list li')).toHaveCount(2)
  })

  test('показывает «Ничего не найдено», когда совпадений нет', async ({ page }) => {
    await page.getByPlaceholder('Поиск по чатам').fill('зззз')

    await expect(page.locator('.chat-list li')).toHaveCount(0)
    await expect(page.getByText('Ничего не найдено')).toBeVisible()
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают по правильной причине**

Run: `cd e2e && npx playwright test tests/search.spec.ts`
Expected: FAIL — все пять тестов падают на таймауте `getByPlaceholder('Поиск по чатам')`, потому что поля поиска в разметке ещё нет. Если падение происходит раньше (в `beforeEach`), значит сломан стенд, а не фича — разбираться с этим до реализации.

- [ ] **Step 3: Добавить состояние и производный список**

В `front/src/components/ChatView.vue`, в блоке `<script setup>` рядом с остальными `ref`:

```ts
const search = ref('')
```

И рядом с остальными `computed`:

```ts
const filteredChats = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return chats.value

  return chats.value.filter((chat) => chat.title.toLowerCase().includes(query))
})
```

- [ ] **Step 4: Вывести поле поиска и пустой результат**

В `<template>`, внутри `<aside class="sidebar">`: поле добавляется между кнопкой `＋ Новый чат` и списком, `v-for` переводится на `filteredChats`, под списком появляется строка пустого результата.

```html
      <input v-model="search" placeholder="Поиск по чатам" />

      <ul class="chat-list">
        <li v-for="chat in filteredChats" :key="chat.id">
          <button
            :class="{ active: chat.id === activeChatId }"
            :disabled="streaming"
            @click="selectChat(chat.id)"
          >
            {{ chat.title }}
          </button>
        </li>
      </ul>

      <p v-if="search.trim() && !filteredChats.length" class="no-results">
        Ничего не найдено
      </p>
```

Поле не получает `:disabled="streaming"` — фильтрация локальная и во время стрима безопасна (критерий 7).

- [ ] **Step 5: Добавить стиль строки пустого результата**

В `front/src/style.css`, после блока `.chat-list button.active`:

```css
.no-results {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
```

- [ ] **Step 6: Прогнать тесты**

Run: `cd e2e && npx playwright test tests/search.spec.ts`
Expected: PASS, 4 passed.

- [ ] **Step 7: Проверить, что ничего не сломано**

Run: `cd e2e && npx playwright test`
Expected: PASS, 5 passed (четыре новых теста + `chat.spec.ts`).

Run: `cd front && npm run build`
Expected: сборка проходит, `vue-tsc` не выдаёт ошибок типов.

---

### Task 2: Сброс запроса при создании чата

Закрывает критерий приёмки 6. Без него только что созданный чат не проходит фильтр и исчезает из сайдбара.

**Files:**
- Modify: `e2e/tests/search.spec.ts`
- Modify: `front/src/components/ChatView.vue`

**Interfaces:**
- Consumes: `search: Ref<string>` из Task 1; хелпер `send(page, text)` и `test.beforeEach` из `e2e/tests/search.spec.ts`.
- Produces: ничего нового; меняется поведение существующих `createNewChat()` и `send()`.

- [ ] **Step 1: Написать падающий тест**

Дописать внутрь блока `test.describe('со списком чатов', ...)` в `e2e/tests/search.spec.ts`, последним тестом (нужен его `beforeEach` с двумя чатами):

```ts
test('сбрасывает запрос при создании нового чата', async ({ page }) => {
  const search = page.getByPlaceholder('Поиск по чатам')
  await search.fill('кош')
  await expect(page.locator('.chat-list li')).toHaveCount(1)

  await page.locator('.new-chat').click()

  await expect(search).toHaveValue('')
  await expect(page.locator('.chat-list li')).toHaveCount(3)
})
```

- [ ] **Step 2: Убедиться, что тест падает по правильной причине**

Run: `cd e2e && npx playwright test tests/search.spec.ts -g "сбрасывает запрос"`
Expected: FAIL — `expect(search).toHaveValue('')` видит `кош`: запрос остался, и новый чат в сайдбаре не показан.

- [ ] **Step 3: Сбросить запрос в обеих точках создания чата**

В `front/src/components/ChatView.vue`, в `createNewChat()` — после `messages.value = []`:

```ts
  search.value = ''
```

И в `send()`, внутри ветки автосоздания, после `activeChatId.value = chatId`:

```ts
      search.value = ''
```

Обе точки нужны: чат создаётся и кнопкой, и первым сообщением, и в обоих случаях пользователь должен увидеть результат.

- [ ] **Step 4: Прогнать тест**

Run: `cd e2e && npx playwright test tests/search.spec.ts -g "сбрасывает запрос"`
Expected: PASS.

- [ ] **Step 5: Проверить, что ничего не сломано**

Run: `cd e2e && npx playwright test`
Expected: PASS, 6 passed.

Run: `cd front && npm run build`
Expected: сборка проходит без ошибок типов.
