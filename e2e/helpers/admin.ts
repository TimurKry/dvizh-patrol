import { expect, type Browser, type Page } from '@playwright/test';

/**
 * Вход организатора и подготовка состояния мероприятия.
 *
 * Нужны обоим сценариям: quest-flow гоняет квест по всем статусам,
 * а participant.spec требует открытого набора команд. Раньше
 * набор приходилось открывать руками до запуска, и весь файл
 * падал, если предыдущий прогон оставил квест в другом статусе.
 */

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL!);
  await page.getByLabel('Пароль').fill(ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Нажимает переход статуса, если такая кнопка сейчас есть. */
export async function setEventStatus(page: Page, buttonName: RegExp): Promise<boolean> {
  await page.goto('/admin/event');
  const button = page.getByRole('button', { name: buttonName });
  if ((await button.count()) === 0) return false;

  page.once('dialog', (dialog) => void dialog.accept());
  await button.first().click();
  await page.waitForLoadState('networkidle');
  return true;
}

/**
 * Открывает набор команд, если мероприятие ещё в черновике.
 *
 * Граф переходов односторонний: из «идёт» и «завершён» в набор
 * не вернуться, и это правильно — переоткрывать регистрацию на
 * ходу почти всегда ошибка. Поэтому тесты участника рассчитаны на
 * мероприятие в черновике или в наборе, то есть на чистую тестовую
 * базу; помощник лишь избавляет от ручного нажатия кнопки.
 */
export async function ensureRegistrationOpen(browser: Browser): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginAsAdmin(page);
    await setEventStatus(page, /Открыть регистрацию/);
  } finally {
    await context.close();
  }
}
