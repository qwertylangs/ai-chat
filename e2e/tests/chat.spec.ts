import { expect, test } from '@playwright/test'

const STUB_REPLY = 'Это ответ стаба OpenRouter.' // держать в согласии с fake_openrouter.py

test('регистрация, ответ ассистента и сохранение истории', async ({ page }) => {
  const username = `user_${Date.now()}`

  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByPlaceholder('Имя пользователя').fill(username)
  await page.getByPlaceholder('Пароль').fill('password123')
  await page.getByRole('button', { name: 'Создать аккаунт и войти' }).click()

  const composer = page.getByPlaceholder('Сообщение')
  await expect(composer).toBeVisible()
  await composer.fill('Привет')
  await composer.press('Enter')

  await expect(page.locator('.message.user .bubble')).toHaveText('Привет')
  await expect(page.locator('.message.assistant .bubble')).toHaveText(STUB_REPLY)

  // История переживает перезагрузку — значит ответ сохранён в БД после стрима.
  await page.reload()
  await page.getByRole('button', { name: 'Привет' }).click()
  await expect(page.locator('.message.assistant .bubble')).toHaveText(STUB_REPLY)
})
