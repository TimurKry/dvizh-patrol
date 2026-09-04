import { existsSync, readFileSync } from 'node:fs';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

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

/**
 * Сессия организатора живёт один прогон.
 *
 * Вход ограничен десятью попытками за четверть часа — защита от
 * перебора пароля, и ослаблять её ради тестов нельзя. А входов у
 * связки набиралось одиннадцать: по одному почти в каждом тесте
 * плюс подготовка в обоих браузерных профилях. Первые десять
 * проходили, одиннадцатый упирался в лимит, и падал не тот тест,
 * который что-то сломал, а тот, которому не повезло с очередью.
 *
 * Поэтому форму заполняем один раз, а дальше подкладываем cookie.
 * Файл лежит в `outputDir`, который Playwright чистит перед каждым
 * прогоном: сессия не переживает запуск, а внутри запуска
 * переиспользуется. Сама форма входа при этом остаётся проверенной
 * — первый тест каждого прогона проходит через неё.
 */
const ADMIN_STATE = 'e2e-results/admin-state.json';

export async function loginAsAdmin(page: Page): Promise<void> {
  if (existsSync(ADMIN_STATE)) {
    const saved = JSON.parse(readFileSync(ADMIN_STATE, 'utf8')) as {
      cookies?: Parameters<BrowserContext['addCookies']>[0];
    };
    await page.context().addCookies(saved.cookies ?? []);
    await page.goto('/admin');

    // База между прогонами пересоздаётся, и сохранённая сессия
    // может оказаться от прошлой жизни. Тогда просто входим сами.
    if (new URL(page.url()).pathname === '/admin') return;
  }

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL!);
  await page.getByLabel('Пароль').fill(ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().storageState({ path: ADMIN_STATE });
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
