import { expect, test, type Page } from '@playwright/test'

const STUB_REPLY = 'Это ответ стаба OpenRouter.' // держать в согласии с fake_openrouter.py

async function register(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByPlaceholder('Имя пользователя').fill(`user_${Date.now()}`)
  await page.getByPlaceholder('Пароль').fill('password123')
  await page.getByRole('button', { name: 'Создать аккаунт и войти' }).click()
}

/** Отправляет сообщение и ждёт, пока в ленте станет `replies` завершённых ответов. */
async function send(page: Page, text: string, replies: number) {
  const composer = page.getByPlaceholder('Сообщение')
  await composer.fill(text)
  await composer.press('Enter')
  await expect(page.locator('.message.assistant')).toHaveCount(replies)
  await expect(page.locator('.message.assistant .bubble').last()).toHaveText(STUB_REPLY)
}

test('после ответа показывает остаток токенов', async ({ page }) => {
  await register(page)

  await send(page, 'Первый', 1)

  await expect(page.getByText('Осталось 700 из 1000 токенов')).toBeVisible()
})

test('исчерпанный лимит блокирует ввод и называет время сброса', async ({ page }) => {
  await register(page)

  for (let i = 1; i <= 4; i++) await send(page, `Вопрос ${i}`, i)

  await expect(page.getByText('Лимит токенов исчерпан. Новые сообщения можно отправить после')).toBeVisible()
  await expect(page.getByPlaceholder('Сообщение')).toBeDisabled()
  await expect(page.locator('.composer button')).toBeDisabled()
})
