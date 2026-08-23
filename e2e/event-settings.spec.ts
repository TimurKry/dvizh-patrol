import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdmin } from './helpers/admin';

/**
 * Настройки мероприятия.
 *
 * Живой случай: организатор жаловался, что настройки «не
 * сохраняются». Оказалось хуже — они сохранялись, но каждое
 * нажатие «Сохранить» сдвигало все даты на смещение часового
 * пояса. Три нажатия подряд, ничего не меняя, уводили старт на
 * шесть часов. Форма показывала берлинское время, сервер читал ту
 * же строку как UTC.
 *
 * Второе: при отказе всё введённое исчезало. React 19 сбрасывает
 * неуправляемые поля после серверного действия — то есть форма
 * стирала работу в наказание за собственную придирчивость.
 *
 * Тест намеренно ничего не меняет в расписании: он проверяет, что
 * сохранение само по себе данные не портит.
 */

test.skip(
  !ADMIN_EMAIL || !ADMIN_PASSWORD,
  'Нужны E2E_ADMIN_EMAIL и E2E_ADMIN_PASSWORD — см. playwright.config.ts',
);

test('сохранение не двигает даты и не стирает введённое', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/event');

  const startsAt = page.locator('#startsAt');
  const before = await startsAt.inputValue();
  expect(before).not.toBe('');

  const save = page.getByRole('button', { name: 'Сохранить настройки' });

  // Три раза подряд, не трогая ни одного поля.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await save.click();
    await expect(page.getByText('Настройки сохранены.')).toBeVisible();
    await expect(startsAt, `дата уехала после ${attempt}-го сохранения`).toHaveValue(before);
  }

  // И после перезагрузки: сдвиг мог быть только в показе.
  await page.reload();
  await expect(startsAt).toHaveValue(before);

  // Отказ не стирает работу. Название места сбора запоминаем, а
  // время встречи ставим заведомо раньше старта — форма откажет.
  await page.locator('#finishTitle').fill('Проверка сохранения');
  await page.locator('#finishAt').fill('2020-01-01T10:00');
  await save.click();

  await expect(page.getByText('Встреча после игры, а не до неё')).toBeVisible();
  await expect(page.locator('#finishTitle')).toHaveValue('Проверка сохранения');
  await expect(page.locator('#finishAt')).toHaveValue('2020-01-01T10:00');
});
