/**
 * Съёмка титров.
 *
 * Тот же браузер и тот же захват экрана, что у сцен приложения:
 * заставка и финальная плашка должны попасть в монтаж с теми же
 * пикселями, шрифтами и зерном, что и остальной ролик.
 */

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Recorder, calibrate, hold, openPhone, settle } from './recorder.mjs';

const OUT = path.resolve(import.meta.dirname, '../scratch/scenes');
const PAGE = `file://${path.resolve(import.meta.dirname, '../src/titles.html')}`;

async function main() {
  await mkdir(OUT, { recursive: true });

  const { browser, page, display } = await openPhone();
  const rect = await calibrate(page, display);
  const rec = new Recorder({ display, rect, dir: OUT });

  for (const [name, scene, seconds] of [
    ['title-hook', 'hook', 3.0],
    ['title-cta', 'cta', 2.0],
  ]) {
    await page.goto(`${PAGE}?scene=${scene}`, { waitUntil: 'load' });
    await settle(page, 900);

    await rec.scene(name, async () => {
      await hold(1500);
      await page.evaluate(() => window.__play());
      await hold(seconds * 1000);
    });
  }

  await browser.close();
  process.stdout.write('Титры записаны\n');
}

main().catch((error) => {
  process.stderr.write(`record-titles: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
