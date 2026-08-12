import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdmin } from './helpers/admin';

/**
 * Создание задания с нуля.
 *
 * Живой случай: организатор завёл задание, не заполнив «Полное
 * описание», нажал внизу «Создать задание» — и не увидел ничего.
 * Задание в базу не попало, а форма промолчала: подпись об ошибке
 * появилась вверху, за пределами экрана. Со стороны это выглядело
 * как поломка сохранения.
 *
 * Один тест, а не два: это одна дорога — отказ, исправление,
 * сохранение. Разделив её, мы бы получили два входа организатора,
 * а вход ограничен десятью попытками за четверть часа на всю
 * связку тестов.
 */

test.skip(
  !ADMIN_EMAIL || !ADMIN_PASSWORD,
  'Нужны E2E_ADMIN_EMAIL и E2E_ADMIN_PASSWORD — см. playwright.config.ts',
);

test('задание с нуля: отказ виден, а сохранённое открывает загрузку картинки', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/tasks/new');

  const title = `Повторим мем ${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  await page.getByLabel('Название').fill(title);
  // Описание намеренно пустое — ровно то, что сделал организатор.

  const submit = page.getByRole('button', { name: 'Создать задание' });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  // Первое: форма назвала поле общим сообщением, а не только
  // подписью под самим полем. Подпись там была и раньше — но
  // ровно там, куда организатор в этот момент не смотрит.
  await expect(page.getByRole('alert').filter({ hasText: 'Задание не сохранено' })).toContainText(
    'Полное описание',
  );

  // Второе: страница перенесла к полю, а не оставила у кнопки.
  const description = page.locator('#description');
  await expect(description).toBeFocused();
  await expect(description).toBeInViewport();

  // Третье: адрес не менялся, задание не создавалось.
  await expect(page).toHaveURL(/\/admin\/tasks\/new$/);

  // А после исправления — сохраняется.
  await description.fill('Найдите место с фотографии и повторите позу всей командой.');
  await page.getByRole('button', { name: 'Создать задание' }).click();

  // Адрес самого задания, а не список: картинка привязывается к
  // идентификатору, которого до сохранения не существовало.
  await expect(page).toHaveURL(/\/admin\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.locator('input[type=file]')).toHaveCount(1);
});
