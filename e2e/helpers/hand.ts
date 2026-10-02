import { expect, type Page } from '@playwright/test';

/**
 * Рука команды: открыть карту и уйти на страницу задания.
 *
 * Карты лежат рубашкой вверх, и ссылка на задание появляется
 * только внутри открытой карты. Раньше тест просто кликал по
 * первой `a[href^="/tasks/"]` в раскладке — теперь такой ссылки в
 * раскладке нет, и шаг «открыть карту» стал частью сценария.
 */
export async function openFirstTask(page: Page): Promise<void> {
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Задания' })).toBeVisible();

  await page
    .getByRole('button', { name: /^Открыть карточку:/ })
    .first()
    .click();

  const link = page.getByRole('link', { name: 'Открыть задание' });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}/);
}
