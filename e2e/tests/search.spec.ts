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

  test('сбрасывает запрос при создании нового чата', async ({ page }) => {
    const search = page.getByPlaceholder('Поиск по чатам')
    await search.fill('кош')
    await expect(page.locator('.chat-list li')).toHaveCount(1)

    await newChat(page)

    await expect(search).toHaveValue('')
    await expect(page.locator('.chat-list li')).toHaveCount(3)
  })
})
