import { expect, test, type Page } from '@playwright/test'

const STUB_REPLY = 'Это ответ стаба OpenRouter.' // держать в согласии с fake_openrouter.py

async function register(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByPlaceholder('Имя пользователя').fill(`user_${Date.now()}`)
  await page.getByPlaceholder('Пароль').fill('password123')
  await page.getByRole('button', { name: 'Создать аккаунт и войти' }).click()
}

async function send(page: Page, text: string) {
  const composer = page.getByPlaceholder('Сообщение')
  await composer.fill(text)
  await composer.press('Enter')
  await expect(page.locator('.message.assistant .bubble').last()).toHaveText(STUB_REPLY)
}

/** Считает GET /api/chats/{id}/messages — загрузки истории с сервера. */
function countHistoryLoads(page: Page) {
  const urls: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'GET' && /\/api\/chats\/\d+\/messages$/.test(req.url())) {
      urls.push(req.url())
    }
  })
  return urls
}

test('только что созданный чат не грузит историю с сервера', async ({ page }) => {
  await register(page)
  const loads = countHistoryLoads(page)

  await page.locator('.new-chat').click()
  await expect(page.locator('.chat-list li')).toHaveCount(1)
  await page.waitForTimeout(300) // даём отработать возможному фоновому запросу

  expect(loads).toHaveLength(0)
})

test('первое сообщение в новом чате грузит историю один раз — после стрима', async ({ page }) => {
  await register(page)
  const loads = countHistoryLoads(page)

  await send(page, 'Привет')

  await expect(page.locator('.message.user .bubble')).toHaveText('Привет')
  await expect(page.locator('.message.assistant .bubble')).toHaveText(STUB_REPLY)
  expect(loads).toHaveLength(1)
})

test('ошибка загрузки истории показывает баннер, а не падает молча', async ({ page }) => {
  await register(page)
  await send(page, 'Кошки')
  await page.locator('.new-chat').click()
  await expect(page.locator('.chat-list li')).toHaveCount(2) // createNewChat() асинхронна
  await send(page, 'Собаки')

  await page.route('**/api/chats/*/messages', (route) =>
    route.request().method() === 'GET' ? route.abort('failed') : route.continue(),
  )
  await page.getByRole('button', { name: 'Кошки' }).click()

  await expect(page.locator('.error-banner')).toBeVisible()
})
