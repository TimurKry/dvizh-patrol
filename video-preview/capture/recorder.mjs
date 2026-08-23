/**
 * Запись экрана телефона.
 *
 * Как это устроено и почему именно так.
 *
 * **Настоящий телефонный вьюпорт, а не уменьшенный десктоп.**
 * Chromium запускается под Xvfb с `--force-device-scale-factor=3`,
 * а поверх ставится эмуляция устройства 390×844 с тач-вводом. Внутри
 * страницы `innerWidth` равен 390, `devicePixelRatio` — трём: ровно
 * то, что видит iPhone. На экране X это 1170×2532 настоящих
 * пикселей, поэтому в 1080×1920 кадр уходит с уменьшением, а не с
 * растяжением.
 *
 * **Кадры снимает ffmpeg, а не Playwright.** Штатная видеозапись
 * Playwright пишет вьюпорт в CSS-пикселях (390×844), а CDP-скринкаст
 * отдаёт кадры размером с композиторскую поверхность — тоже 390×844.
 * `x11grab` берёт то, что реально нарисовано на экране, со всеми
 * CSS-переходами и переворотом карточки.
 *
 * **Область захвата вычисляется, а не задаётся числом.** У окна
 * браузера сверху панель вкладок и адресная строка; их высота
 * зависит от сборки. Перед записью страница заливается контрольным
 * цветом, кадр разбирается попиксельно, и дальше пишется ровно
 * прямоугольник страницы.
 */

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const PHONE = { width: 390, height: 844, scale: 3 };
export const SCREEN = { width: 1600, height: 3000 };

const CHROME =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export const hold = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ═══ Браузер ═══════════════════════════════════════════════════

export async function openPhone({ display = ':99' } = {}) {
  process.env.DISPLAY = display;

  const browser = await chromium.launch({
    headless: false,
    executablePath: CHROME,
    // Полоса «браузером управляет автоматизация» съедает верх окна
    // и попадает в кадр.
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--window-position=0,0',
      // Меньше 500 логических точек Chromium окно не делает, поэтому
      // ширина берётся с запасом, а лишнее отрезается по калибровке.
      '--window-size=500,980',
      '--force-device-scale-factor=3',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--disable-lcd-text',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext({
    viewport: null,
    locale: 'ru-RU',
    timezoneId: 'Europe/Berlin',
    // Реальная геопозиция не запрашивается ни разу: браузеру
    // подставляется центр Лейпцига.
    geolocation: { latitude: 51.3397, longitude: 12.3731 },
    permissions: ['geolocation'],
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: PHONE.width,
    height: PHONE.height,
    deviceScaleFactor: PHONE.scale,
    mobile: true,
    screenWidth: PHONE.width,
    screenHeight: PHONE.height,
    screenOrientation: { angle: 0, type: 'portraitPrimary' },
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  return { browser, context, page, cdp, display };
}

// ═══ Калибровка области захвата ════════════════════════════════

function grabFrame(display) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-f', 'x11grab',
      '-video_size', `${SCREEN.width}x${SCREEN.height}`,
      '-i', display,
      '-frames:v', '1',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1',
    ]);
    const chunks = [];
    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
    ffmpeg.on('error', reject);
    ffmpeg.on('close', () => resolve(Buffer.concat(chunks)));
  });
}

/** Прямоугольник страницы на экране X. */
export async function calibrate(page, display) {
  await page.goto('about:blank');
  await page.evaluate(() => {
    document.documentElement.style.background = '#00ff00';
    document.body.style.cssText = 'margin:0;background:#00ff00;width:100vw;height:100vh';
  });
  await hold(500);

  const frame = await grabFrame(display);
  const { width, height } = SCREEN;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      if (frame[i] < 40 && frame[i + 1] > 200 && frame[i + 2] < 40) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error('калибровка: контрольный цвет не найден на экране');

  // Ширина/высота приводятся к чётным: H.264 не любит нечётные.
  const rect = {
    x: minX,
    y: minY,
    width: (maxX - minX + 1) & ~1,
    height: (maxY - minY + 1) & ~1,
  };

  const expectedWidth = PHONE.width * PHONE.scale;
  const expectedHeight = PHONE.height * PHONE.scale;
  if (Math.abs(rect.width - expectedWidth) > 6) {
    throw new Error(`калибровка: ширина ${rect.width}, ожидали ${expectedWidth}`);
  }
  if (Math.abs(rect.height - expectedHeight) > 6) {
    throw new Error(
      `калибровка: высота ${rect.height}, ожидали ${expectedHeight} — увеличьте --window-size`,
    );
  }

  return rect;
}

// ═══ Запись сцены ══════════════════════════════════════════════

export class Recorder {
  constructor({ display, rect, dir, fps = 30 }) {
    this.display = display;
    this.rect = rect;
    this.dir = dir;
    this.fps = fps;
    this.current = null;
  }

  async scene(name, body) {
    await mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, `${name}.mp4`);

    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-loglevel', 'error',
      '-f', 'x11grab',
      '-draw_mouse', '0',
      '-framerate', String(this.fps),
      '-video_size', `${this.rect.width}x${this.rect.height}`,
      '-i', `${this.display}+${this.rect.x},${this.rect.y}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '14',
      '-pix_fmt', 'yuv420p',
      file,
    ]);

    ffmpeg.stderr.on('data', (chunk) => process.stderr.write(chunk));

    // ffmpeg открывает X-дисплей не мгновенно: первые кадры сцены
    // иначе теряются.
    await hold(900);

    const startedAt = Date.now();
    await body();
    await hold(250);

    ffmpeg.stdin.write('q');
    await new Promise((resolve) => ffmpeg.on('close', resolve));

    const seconds = (Date.now() - startedAt) / 1000;
    process.stdout.write(`  · ${name} — ${seconds.toFixed(1)} c\n`);
    return { file, seconds };
  }
}

// ═══ Взаимодействие ════════════════════════════════════════════

/** Нажатие по координатам: для того, что нельзя листать, — карты. */
export async function tapAt(page, x, y, options = {}) {
  await page.evaluate(([px, py]) => window.__tapRipple?.(px, py), [x, y]);
  await hold(options.before ?? 160);
  await page.mouse.click(x, y);
  await hold(options.after ?? 0);
}

/** Нажатие с кружком под пальцем — как в записи экрана телефона. */
export async function tap(page, target, options = {}) {
  const locator = typeof target === 'string' ? page.locator(target) : target;
  if (!options.noScroll) await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) throw new Error('нечего нажимать: элемент вне экрана');

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.evaluate(([px, py]) => window.__tapRipple?.(px, py), [x, y]);
  await hold(options.before ?? 160);
  await locator.click({ position: options.position, force: options.force });
  await hold(options.after ?? 0);
}

/** Плавная прокрутка вместо мгновенного прыжка. */
export async function smoothScroll(page, to, ms = 900) {
  await page.evaluate(
    ([target, duration]) =>
      new Promise((resolve) => {
        const from = window.scrollY;
        const delta = target - from;
        const started = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - started) / duration);
          const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          window.scrollTo(0, from + delta * eased);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
}

/** Ждём шрифты и картинки: иначе в кадр попадёт полузагруженный экран. */
export async function settle(page, extra = 350) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images].filter((img) => !img.complete);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }),
      ),
    );
  });
  await hold(extra);
}
