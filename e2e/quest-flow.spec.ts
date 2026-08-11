import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdmin, setEventStatus } from './helpers/admin';

/**
 * Полный цикл: организатор запускает квест, команда отправляет
 * фотографию, организатор её проверяет, баллы попадают в рейтинг.
 *
 * Это единственный тест, который трогает состояние мероприятия,
 * поэтому он и требует отдельного тестового проекта Supabase.
 */

test.skip(
  !ADMIN_EMAIL || !ADMIN_PASSWORD,
  'Нужны E2E_ADMIN_EMAIL и E2E_ADMIN_PASSWORD — см. playwright.config.ts',
);

const unique = () => Math.random().toString(36).slice(2, 8).toUpperCase();

test.describe.serial('полный цикл квеста', () => {
  const teamName = `Цикл ${unique()}`;
  let joinCode = '';

  test('организатор открывает регистрацию', async ({ page }) => {
    await loginAsAdmin(page);
    await setEventStatus(page, /Открыть регистрацию/);

    await page.goto('/admin/event');
    await expect(page.getByRole('heading', { name: /Статус:/ })).toBeVisible();
  });

  test('команда регистрируется', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/register');
    await page.getByLabel('Название команды').fill(teamName);
    await page.getByLabel('Имя капитана').fill('Капитан');
    await page.getByRole('checkbox', { name: /принимаю/i }).check();
    await page.getByRole('button', { name: 'Создать команду' }).click();

    await expect(page).toHaveURL(/\/team/);
    joinCode = (await page.locator('[aria-label^="Код команды"]').innerText()).trim();
    expect(joinCode).toMatch(/^[A-Z0-9]{6}$/);

    await context.storageState({ path: 'e2e-results/team-state.json' });
    await context.close();
  });

  test('организатор запускает квест', async ({ page }) => {
    await loginAsAdmin(page);
    await setEventStatus(page, /Запустить квест/);

    await page.goto('/admin');
    // Статус виден и в заголовке сводки, и в сайдбаре — берём
    // заголовок, иначе строгий режим найдёт два совпадения.
    await expect(page.getByRole('heading', { name: /Движ/ })).toBeVisible();
    await expect(page.locator('main').getByText(/Идёт/).first()).toBeVisible();
  });

  test('команда видит задания и открывает одно', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e-results/team-state.json' });
    const page = await context.newPage();

    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Задания' })).toBeVisible();

    const firstTask = page.locator('a[href^="/tasks/"]').first();
    await expect(firstTask).toBeVisible();
    await firstTask.click();

    await expect(page.getByRole('button', { name: 'Сделать фото' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Выбрать из галереи' })).toBeVisible();

    await context.close();
  });

  test('команда отправляет фотографию и может идти дальше', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e-results/team-state.json' });
    const page = await context.newPage();

    // Фильтров больше нет: команда видит руку из шести карточек
    // и открывает любую из них.
    await page.goto('/tasks');
    await page.locator('a[href^="/tasks/"]').first().click();

    // Подставляем файл напрямую: настоящую камеру браузер не даст.
    const poster = readFileSync(join(process.cwd(), 'e2e/fixtures/photo.jpg'));
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: poster,
    });

    // Появился предпросмотр со сжатым размером.
    await expect(page.getByAltText('Выбранная фотография')).toBeVisible();
    await expect(page.getByText(/После сжатия/)).toBeVisible();

    await page.getByRole('button', { name: 'Отправить на проверку' }).click();

    // Успех виден в двух видах подряд: PhotoUpload показывает
    // подтверждение, а прилетевший следом router.refresh() заменяет
    // форму блоком статуса и подтверждение размонтирует. Что успеет
    // увидеть тест, зависит от скорости сервера, поэтому ждём любой
    // из двух кадров.
    await expect(
      page.getByText(/отправлено на проверку|уже на проверке/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Устойчивый итог: повторно отправить по этому заданию нельзя.
    await expect(page.getByRole('button', { name: 'Отправить на проверку' })).toHaveCount(0);

    await context.close();
  });

  test('отправка появилась в списке команды', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e-results/team-state.json' });
    const page = await context.newPage();

    await page.goto('/submissions');
    await expect(page.locator('a[href^="/submissions/"]').first()).toBeVisible();

    await context.close();
  });

  test('организатор видит отправку в очереди', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/submissions?tab=all');

    await expect(page.getByText(teamName).first()).toBeVisible();
  });

  test('организатор принимает фотографию', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/submissions?tab=all');

    await page.locator('a[href^="/admin/submissions/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Решение' })).toBeVisible();

    await page.getByRole('button', { name: 'Принять', exact: true }).click();
    await page.getByRole('button', { name: 'Принять задание' }).click();

    // Слово встречается и в значке статуса, и в подтверждении.
    await expect(page.getByText(/Принято|уже была принята/).first()).toBeVisible();
  });

  test('баллы попали в рейтинг', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByText(teamName)).toBeVisible();
  });

  test('команда видит начисление', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e-results/team-state.json' });
    const page = await context.newPage();

    await page.goto('/team');
    await expect(page.getByText('Последние изменения баллов')).toBeVisible();

    await context.close();
  });

  test('организатор завершает квест', async ({ page }) => {
    await loginAsAdmin(page);
    await setEventStatus(page, /Завершить/);

    await page.goto('/admin');
    // Статус повторяется в сайдбаре — смотрим на содержимое.
    await expect(
      page
        .locator('main')
        .getByText(/Завершён/)
        .first(),
    ).toBeVisible();
  });

  test('после завершения отправки закрыты', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e-results/team-state.json' });
    const page = await context.newPage();

    await page.goto('/tasks');
    await expect(page.getByText(/Квест завершён/)).toBeVisible();

    await context.close();
  });
});

test.describe('экспорт', () => {
  test.skip(!ADMIN_EMAIL, 'нужен администратор');

  test('выгрузка рейтинга отдаёт CSV', async ({ page }) => {
    await loginAsAdmin(page);

    const response = await page.request.get('/api/admin/export/leaderboard');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/csv');

    const body = await response.text();
    // BOM обязателен, иначе Excel испортит кириллицу.
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain('место,команда,баллы');
  });
});
