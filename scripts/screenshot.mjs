#!/usr/bin/env node
/**
 * Снимок страницы для визуальной проверки.
 *
 * Проверяет заодно две вещи, которые на глаз ловятся плохо:
 * горизонтальную прокрутку и ошибки в консоли. Перед снимком
 * страница прокручивается до конца, иначе блоки с `.reveal`
 * останутся прозрачными и на снимке будет пустота.
 *
 * Запуск:
 *   node scripts/screenshot.mjs <url> <файл.png> <ширина> <высота> [full]
 */

import { chromium } from '@playwright/test';
const [, , url, out, w, h, full] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
// Прокручиваем до конца, чтобы сработали IntersectionObserver
// у .reveal — иначе на снимке всей страницы половина блоков
// осталась бы прозрачной.
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(900);
const overflow = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
}));
console.log(
  out.split('/').pop(),
  JSON.stringify(overflow),
  overflow.scrollW > overflow.clientW ? 'HORIZONTAL SCROLL!' : 'ok',
  errors.length ? `ERRORS: ${errors.slice(0, 3).join(' | ')}` : '',
);
await page.screenshot({ path: out, fullPage: full === 'full' });
await browser.close();
