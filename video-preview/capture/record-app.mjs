/**
 * Съёмка сцен приложения.
 *
 * Один браузер, одно окно, один проход по сценарию участника:
 * вход по коду → рука → карточка → задание → карта → фотография →
 * проверка организатором → баллы → рейтинг. Сцены пишутся по
 * отдельности, чтобы монтаж можно было пересобрать, не переснимая
 * всё заново.
 *
 * Ничего не имитируется: каждое нажатие идёт по настоящему DOM,
 * каждый статус приходит с сервера, баллы считает та же функция
 * accept_submission, что и на мероприятии.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  Recorder,
  calibrate,
  hold,
  openPhone,
  settle,
  smoothScroll,
  tap,
  tapAt,
} from './recorder.mjs';
import { TOUCH_OVERLAY } from './touch-overlay.mjs';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:3000';
const OUT = path.resolve(import.meta.dirname, '../scratch/scenes');
const JOIN_CODE = process.env.DEMO_JOIN_CODE ?? 'DEMO26';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo-admin@dvizh-patrol.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'demo-admin-password';

const card = (page, index) =>
  page.getByRole('button', { name: /Открыть карточку/ }).nth(index);
const dialog = (page) => page.locator('[role=dialog]');

async function main() {
  await mkdir(OUT, { recursive: true });

  const { browser, context, page, display } = await openPhone();
  await context.addInitScript(TOUCH_OVERLAY);

  const rect = await calibrate(page, display);
  process.stdout.write(
    `Область захвата: ${rect.width}×${rect.height} @ ${rect.x},${rect.y}\n`,
  );

  const rec = new Recorder({ display, rect, dir: OUT });
  const timings = {};

  // Переснять одну сцену: SCENES=map npm run video:capture. Сценарий
  // при этом проходится целиком — иначе состояние базы разъедется с
  // тем, что показывают остальные сцены.
  const only = (process.env.SCENES ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  const scene = async (name, body) => {
    if (only.length > 0 && !only.includes(name)) {
      process.stdout.write(`  · ${name} — пропуск\n`);
      await body();
      return;
    }
    const result = await rec.scene(name, body);
    timings[name] = result.seconds;
  };

  const open = async (url, wait = 400) => {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
    await settle(page, wait);
  };

  // ═══ 01 · Лендинг ════════════════════════════════════════════
  // Ролику он нужен на секунду: с него начинается путь, но не он
  // содержание. Снимаем герой и витрину с золотой карточкой —
  // единственное место, где золотая карта вообще существует.
  await open('/', 900);
  await scene('landing', async () => {
    await hold(1100);
    await smoothScroll(page, 620, 900);
    await hold(900);
  });

  await scene('landing-deck', async () => {
    const deck = page.getByRole('button', { name: /Открыть пример/ }).first();
    await deck.scrollIntoViewIfNeeded();
    await hold(700);
    await tap(page, deck, { after: 1500 });
    await hold(1200);
    await tap(page, dialog(page).getByRole('button', { name: 'Закрыть', exact: true }), { after: 600 });
  });

  // ═══ 02 · Вход по коду ═══════════════════════════════════════
  await open('/join', 700);
  await scene('join', async () => {
    await hold(700);
    await page.locator('#joinCode').click();
    // По символу: зритель должен увидеть, что код именно шесть
    // знаков, а не просто «поле заполнилось».
    await page.locator('#joinCode').pressSequentially(JOIN_CODE, { delay: 190 });
    await hold(500);
    await page.locator('#memberName').click();
    await page.locator('#memberName').pressSequentially('Аня', { delay: 130 });
    await hold(400);
    await tap(page, 'input[name="acceptRules"]', { after: 400 });
    await tap(page, 'button[type=submit]', { after: 200 });
    await page.waitForURL('**/team**', { timeout: 30_000 });
    await settle(page, 500);
    await hold(700);
  });

  // ═══ 03 · Экран команды ══════════════════════════════════════
  await scene('team', async () => {
    await hold(1200);
    await smoothScroll(page, 420, 850);
    await hold(1100);
    await smoothScroll(page, 900, 850);
    await hold(1000);
    await smoothScroll(page, 0, 700);
    await hold(400);
  });

  // ═══ 04 · Рука: расклад и переворот ══════════════════════════
  await tap(page, 'nav[aria-label="Разделы команды"] a[href="/tasks"]');
  await page.waitForURL('**/tasks', { timeout: 30_000 });
  await settle(page, 700);

  await scene('hand', async () => {
    await hold(1300);
    // Фото-повтор: карточка с эталоном и точкой на карте.
    await tap(page, card(page, 0), { after: 1900 });
    await hold(1500);
    await tap(page, dialog(page).getByRole('button', { name: 'Вернуть в колоду' }), {
      after: 900,
    });
    // Загадка: у неё вместо точки обведён район.
    await tap(page, card(page, 1), { after: 1900 });
    await hold(1700);
    await tap(page, dialog(page).getByRole('button', { name: 'Вернуть в колоду' }), {
      after: 700,
    });
    // Городской актив.
    await tap(page, card(page, 4), { after: 1800 });
    await hold(1400);
    await tap(page, dialog(page).getByRole('button', { name: 'Вернуть в колоду' }), {
      after: 600,
    });
  });

  // ═══ 05 · Открытие задания ═══════════════════════════════════
  await scene('open-task', async () => {
    await hold(600);
    await tap(page, card(page, 0), { after: 1700 });
    await hold(900);
    await tap(page, dialog(page).getByRole('link', { name: /Открыть задание/ }), {
      after: 300,
    });
    await page.waitForURL('**/tasks/**', { timeout: 30_000 });
    await settle(page, 900);
    await hold(1300);
    await smoothScroll(page, 320, 800);
    await hold(1200);
    await smoothScroll(page, 760, 850);
    await hold(1300);
  });

  const taskUrl = page.url();

  // ═══ 06 · Карта ══════════════════════════════════════════════
  await tap(page, 'nav[aria-label="Разделы команды"] a[href="/more"]');
  await page.waitForURL('**/more', { timeout: 30_000 });
  await settle(page, 400);
  await tap(page, 'a[href="/map"]');
  await page.waitForURL('**/map', { timeout: 30_000 });
  await settle(page, 1600);

  await scene('map', async () => {
    // Карта под шапкой целиком: дальше по сцене страница не
    // листается, иначе метка уезжает под липкий заголовок.
    await page.evaluate(() => {
      const map = document.querySelector('.leaflet-container');
      const top = map.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top - 96, behavior: 'instant' });
    });
    await hold(1200);

    const box = await page.locator('.leaflet-container').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Центр скопления меток: к нему и приближаемся.
    const cluster = async () => {
      const icons = page.locator('.leaflet-marker-icon');
      const total = await icons.count();
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let i = 0; i < total; i += 1) {
        const b = await icons.nth(i).boundingBox();
        if (!b) continue;
        sx += b.x + b.width / 2;
        sy += b.y + b.height / 2;
        n += 1;
      }
      return n > 0 ? { x: sx / n, y: sy / n } : { x: cx, y: cy };
    };

    // Панорамирование пальцем.
    await page.mouse.move(cx + 60, cy + 70);
    await page.mouse.down();
    for (let i = 1; i <= 16; i += 1) {
      await page.mouse.move(cx + 60 - i * 4, cy + 70 - i * 3.5);
      await hold(16);
    }
    await page.mouse.up();
    await hold(800);

    // Приближение двойным касанием: Leaflet ведёт зум к точке под
    // пальцем, поэтому метки остаются в кадре, а не уезжают, как при
    // зуме кнопкой по центру.
    for (const _step of [0, 1]) {
      const point = await cluster();
      await page.evaluate(([px, py]) => window.__tapRipple?.(px, py), [point.x, point.y]);
      await page.mouse.dblclick(point.x, point.y);
      await hold(1100);
    }
    await hold(500);

    // Выбор метки: всплывает название задания. Берём ближайшую к
    // центру — она наверняка в кадре и не под шапкой.
    const markers = page.locator('.leaflet-marker-icon');
    const count = await markers.count();
    let best = null;
    for (let i = 0; i < count; i += 1) {
      const b = await markers.nth(i).boundingBox();
      if (!b) continue;
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      if (y < box.y + 60 || y > box.y + box.height - 60) continue;
      const distance = Math.hypot(x - cx, y - cy);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
    if (best) await tapAt(page, best.x, best.y, { after: 1400 });
    await hold(1600);
  });

  // ═══ 07 · Фотография и отправка ══════════════════════════════
  await page.goto(taskUrl, { waitUntil: 'networkidle' });
  await settle(page, 700);
  await smoothScroll(page, 1400, 10);
  await hold(300);

  await scene('upload', async () => {
    await hold(900);
    // Диалог выбора файла перехватывается Playwright и на экране не
    // появляется: в кадре должен остаться интерфейс приложения, а не
    // окно системы.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      tap(page, page.getByRole('button', { name: 'Выбрать из галереи' }), { after: 300 }),
    ]);
    await chooser.setFiles(path.resolve(import.meta.dirname, '../assets/demo-upload.jpg'));
    await page.waitForSelector('text=Отправить на проверку', { timeout: 30_000 });
    await settle(page, 500);
    await hold(1400);
    await tap(page, page.getByRole('button', { name: 'Отправить на проверку' }), { after: 200 });
    // Настоящие стадии: «Готовим отправку…», «Загружаем фотографию…»,
    // «Подтверждаем…» — их пишет сам компонент загрузки.
    // Успех показывается коротко: сразу после него router.refresh()
    // перерисовывает страницу уже со статусом отправки.
    await page.waitForSelector('text=Фото загружено', { timeout: 15_000 }).catch(() => {});
    await hold(2600);
  });

  // Статус задания после отправки.
  await page.goto(taskUrl, { waitUntil: 'networkidle' });
  await settle(page, 600);
  await scene('in-review', async () => {
    await smoothScroll(page, 980, 700);
    await hold(2200);
  });

  // ═══ 08 · Рейтинг до начисления ══════════════════════════════
  await open('/leaderboard', 700);
  await scene('board-before', async () => {
    await hold(2400);
  });

  // ═══ 09 · Организатор подтверждает ═══════════════════════════
  await open('/admin/login', 500);
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/admin', { timeout: 30_000 });
  await open('/admin/submissions', 600);

  await scene('admin', async () => {
    await hold(1100);
    await tap(page, page.locator('a[href*="/admin/submissions/"]').first(), { after: 400 });
    await page.waitForURL('**/admin/submissions/**', { timeout: 30_000 });
    await settle(page, 700);
    await hold(1600);
    await smoothScroll(page, 900, 700);
    await hold(900);
    await tap(page, page.getByRole('button', { name: 'Принять', exact: true }), { after: 500 });
    await smoothScroll(page, 1600, 600);
    await hold(500);
    await tap(page, page.getByRole('button', { name: 'Принять задание' }), { after: 300 });
    await page.waitForLoadState('networkidle');
    await hold(1500);
  });

  // ═══ 10 · Засчитано ══════════════════════════════════════════
  await page.goto(taskUrl, { waitUntil: 'networkidle' });
  await settle(page, 700);
  await scene('accepted', async () => {
    await smoothScroll(page, 980, 700);
    await hold(2600);
  });

  await open('/team', 700);
  await scene('team-after', async () => {
    await hold(1800);
    await smoothScroll(page, 420, 800);
    await hold(1800);
  });

  // ═══ 11 · Рейтинг после начисления ═══════════════════════════
  await open('/leaderboard', 700);
  await scene('board-after', async () => {
    await hold(2600);
  });

  await writeFile(path.join(OUT, 'timings.json'), `${JSON.stringify(timings, null, 2)}\n`);
  await browser.close();
  process.stdout.write('\nСцены записаны в video-preview/scratch/scenes\n');
}

main().catch((error) => {
  process.stderr.write(`record-app: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
