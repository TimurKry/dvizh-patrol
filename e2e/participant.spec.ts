import { expect, test, type Page } from '@playwright/test';
import { ensureRegistrationOpen } from './helpers/admin';

/**
 * Путь участника: регистрация, вход по коду, задание, отправка.
 *
 * Тесты идут по видимому тексту, а не по служебным атрибутам:
 * если формулировка на кнопке изменится, тест должен об этом
 * сказать — участник ориентируется именно по словам.
 *
 * Мероприятие должно быть в черновике или в наборе команд. Если
 * заданы E2E_ADMIN_EMAIL и E2E_ADMIN_PASSWORD, набор открывается
 * автоматически — иначе его нужно открыть руками до запуска.
 */

const unique = () => Math.random().toString(36).slice(2, 8).toUpperCase();

test.beforeAll(async ({ browser }) => {
  await ensureRegistrationOpen(browser);
});

async function registerTeam(page: Page, name: string): Promise<string> {
  await page.goto('/register');

  await page.getByLabel('Название команды').fill(name);
  await page.getByLabel('Имя капитана').fill('Капитан');
  await page.getByLabel('Контакт для организатора').fill('@test');
  await page.getByRole('checkbox', { name: /принимаю/i }).check();
  await page.getByRole('button', { name: 'Создать команду' }).click();

  await expect(page).toHaveURL(/\/team/);

  const code = await page.locator('[aria-label^="Код команды"]').innerText();
  return code.trim();
}

test.describe('регистрация команды', () => {
  test('капитан создаёт команду и получает код', async ({ page }) => {
    const name = `Тест ${unique()}`;
    const code = await registerTeam(page, name);

    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('Команда создана')).toBeVisible();
  });

  test('без согласия с правилами форма не отправляется', async ({ page }) => {
    await page.goto('/register');

    await page.getByLabel('Название команды').fill(`Тест ${unique()}`);
    await page.getByLabel('Имя капитана').fill('Капитан');
    await page.getByRole('button', { name: 'Создать команду' }).click();

    // Остались на форме.
    await expect(page).toHaveURL(/\/register/);
  });

  test('повторное название отклоняется', async ({ page, browser }) => {
    const name = `Дубль ${unique()}`;
    await registerTeam(page, name);

    // Именно новый контекст, а не вкладка: вкладка унаследовала бы
    // cookie только что созданной команды, и /register увёл бы её
    // на страницу команды вместо формы.
    const secondContext = await browser.newContext();
    const second = await secondContext.newPage();
    await second.goto('/register');
    await second.getByLabel('Название команды').fill(name);
    await second.getByLabel('Имя капитана').fill('Другой');
    await second.getByRole('checkbox', { name: /принимаю/i }).check();
    await second.getByRole('button', { name: 'Создать команду' }).click();

    await expect(second.getByText(/уже зарегистрирована/i)).toBeVisible();
    await secondContext.close();
  });
});

test.describe('вход по коду', () => {
  test('участник входит и видит команду', async ({ browser, page }) => {
    const name = `Вход ${unique()}`;
    const code = await registerTeam(page, name);

    const memberContext = await browser.newContext();
    const member = await memberContext.newPage();

    await member.goto('/join');
    await member.getByLabel('Код команды').fill(code);
    await member.getByLabel('Ваше имя').fill('Второй участник');
    await member.getByRole('checkbox', { name: /принимаю/i }).check();
    await member.getByRole('button', { name: 'Войти в команду' }).click();

    await expect(member).toHaveURL(/\/team/);
    await expect(member.getByRole('heading', { name })).toBeVisible();
    await expect(member.getByText('Второй участник')).toBeVisible();

    await memberContext.close();
  });

  test('неверный код показывает понятную ошибку', async ({ page }) => {
    await page.goto('/join');

    await page.getByLabel('Код команды').fill('ZZZZZZ');
    await page.getByLabel('Ваше имя').fill('Никто');
    await page.getByRole('checkbox', { name: /принимаю/i }).check();
    await page.getByRole('button', { name: 'Войти в команду' }).click();

    await expect(page.getByText(/Такого кода не существует/)).toBeVisible();
  });

  test('ссылка-приглашение подставляет код', async ({ browser, page }) => {
    const code = await registerTeam(page, `Ссылка ${unique()}`);

    const context = await browser.newContext();
    const invited = await context.newPage();
    await invited.goto(`/join?code=${code}`);

    await expect(invited.getByLabel('Код команды')).toHaveValue(code);
    await context.close();
  });
});

test.describe('до старта квеста', () => {
  test('задания закрыты и виден обратный отсчёт', async ({ page }) => {
    await registerTeam(page, `Отсчёт ${unique()}`);

    await expect(page.getByRole('timer')).toBeVisible();

    await page.goto('/tasks');
    await expect(page.getByText('Задания ещё закрыты')).toBeVisible();
  });
});

test.describe('доступность', () => {
  test('на главной один заголовок первого уровня', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('навигация проходится с клавиатуры', async ({ page }) => {
    await page.goto('/');

    // Первая остановка — ссылка «Перейти к содержимому».
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();
  });

  test('у изображений есть альтернативный текст', async ({ page }) => {
    await page.goto('/');

    const images = page.locator('main img');
    const count = await images.count();

    for (let i = 0; i < count; i += 1) {
      // Декоративные картинки коллажа несут пустой alt — это
      // корректно и намеренно, но атрибут обязан присутствовать.
      await expect(images.nth(i)).toHaveAttribute('alt', /.*/);
    }
  });

  test('кнопки на мобильном не меньше 44 пикселей', async ({ page }) => {
    // Экран входа организатора: единственная форма, которая
    // отрисовывается в любом статусе мероприятия. Формы участника
    // закрываются вместе с набором и завершением квеста, и тест
    // на них зависел бы от порядка прогонов, а не от вёрстки.
    await page.goto('/admin/login');

    const button = page.getByRole('button', { name: 'Войти' });
    const box = await button.boundingBox();

    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('каждая цель нажатия на лендинге проходит 44×44', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // Проверяем то, во что реально тычут пальцем, а не всё
    // подряд: ссылки внутри абзацев к правилу 44×44 не
    // относятся, а вот кнопки и карточки-CTA — относятся.
    // Панель разработчика Next.js в продакшене отсутствует, и её
    // 32-пиксельная кнопка к интерфейсу отношения не имеет.
    const targets = page
      .locator('a[class*="ticket-notch"], button:visible, nav a:visible')
      .filter({ hasNot: page.locator('[data-nextjs-dev-tools-button]') });
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const target = targets.nth(i);
      const box = await target.boundingBox();
      if (!box) continue;

      const label = (await target.getAttribute('aria-label')) ?? (await target.innerText());
      if (label.includes('Next.js')) continue;

      expect.soft(Math.min(box.width, box.height), label.slice(0, 40)).toBeGreaterThanOrEqual(44);
    }
  });

  test('на лендинге нет горизонтальной прокрутки', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test('при «меньше движения» контент виден сразу и неподвижен', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Блоки с .reveal без наблюдателя остались бы прозрачными
    // навсегда — при reduced-motion они обязаны быть видны сразу.
    const hidden = await page.evaluate(
      () =>
        [...document.querySelectorAll('.reveal')].filter(
          (el) => Number(getComputedStyle(el).opacity) < 0.99,
        ).length,
    );

    expect(hidden).toBe(0);
  });
});

test.describe('PWA', () => {
  test('манифест отдаётся и содержит нужные поля', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBeTruthy();

    const manifest = (await response.json()) as Record<string, unknown>;
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#060609');
    expect(Array.isArray(manifest.icons)).toBe(true);
  });

  test('страница офлайна доступна', async ({ page }) => {
    await page.goto('/offline');
    await expect(page.getByRole('heading', { name: 'Нет соединения' })).toBeVisible();
  });
});
