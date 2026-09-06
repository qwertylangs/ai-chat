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

const trash = (page: Page) => page.getByRole('button', { name: 'Удалить чат' })

test.describe('удаление чата', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await send(page, 'Кошки')
    await newChat(page)
    await send(page, 'Собаки')
    await newChat(page)
    await send(page, 'Птицы') // активный чат после сетапа
    await expect(page.locator('.chat-list li')).toHaveCount(3)
  })

  test('корзина одна и живёт в шапке чата, а не в списке', async ({ page }) => {
    await expect(trash(page)).toHaveCount(1)
    await expect(page.locator('.chat-title')).toContainText('Птицы')
    await expect(page.locator('.chat-list li .delete-chat')).toHaveCount(0)
  })

  test('удаляет активный чат и включает верхний из списка', async ({ page }) => {
    page.once('dialog', (d) => d.accept())
    await trash(page).click()

    await expect(page.locator('.chat-list li')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Птицы' })).toHaveCount(0)
    await expect(page.locator('.chat-title')).toContainText('Собаки')
    await expect(page.locator('.message.user .bubble')).toHaveText('Собаки')
  })

  test('удаление активного чата сбрасывает активный поиск', async ({ page }) => {
    page.once('dialog', (d) => d.accept())
    await page.getByPlaceholder('Поиск по чатам').fill('Собаки')
    await expect(page.locator('.chat-list li')).toHaveCount(1)

    await trash(page).click() // активен «Птицы»

    await expect(page.getByPlaceholder('Поиск по чатам')).toHaveValue('')
    await expect(page.locator('.chat-list li')).toHaveCount(2)
    await expect(page.locator('.chat-title')).toContainText('Собаки')
  })

  test('отмена в диалоге ничего не удаляет', async ({ page }) => {
    page.once('dialog', (d) => d.dismiss())
    await trash(page).click()

    await expect(page.locator('.chat-list li')).toHaveCount(3)
    await expect(page.locator('.chat-title')).toContainText('Птицы')
  })

  test('удаление последнего чата возвращает к пустому состоянию', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    for (const remaining of [2, 1, 0]) {
      await trash(page).click()
      await expect(page.locator('.chat-list li')).toHaveCount(remaining)
    }

    await expect(page.locator('.chat-list li')).toHaveCount(0)
    await expect(page.locator('.chat-title')).toHaveCount(0)
    await expect(page.locator('.empty-state')).toBeVisible()
  })
})
