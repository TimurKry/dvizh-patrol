/**
 * Отрисовка подписей в PNG с прозрачным фоном.
 *
 * Подписи набраны Unbounded — тем же шрифтом, что и заголовки
 * приложения. `drawtext` в ffmpeg так не умеет: ни межбуквенного,
 * ни переносов, ни подложки с полосой сигнала. Проще один раз
 * снять готовые слои браузером.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../scratch/overlays');
const PAGE = `file://${path.resolve(import.meta.dirname, 'overlays.html')}`;

const NAMES = [
  'plate',
  'join',
  'team',
  'photo',
  'pool',
  'riddle',
  'choose',
  'route',
  'send',
  'review',
  'admin',
  'scored',
  'board',
];

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
});

await mkdir(OUT, { recursive: true });

const page = await browser.newPage({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
});

for (const name of NAMES) {
  await page.goto(`${PAGE}?name=${name}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    omitBackground: name !== 'plate',
  });
  process.stdout.write(`  · ${name}.png\n`);
}

await browser.close();
