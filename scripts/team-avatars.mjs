#!/usr/bin/env node
/**
 * Аватарки команд для чатов Telegram.
 *
 * Рисуются той же рубашкой, что и карточки в приложении: сплошная
 * заливка командным цветом и повторяющийся фирменный знак поверх.
 * Команда, которая весь вечер смотрит на свою красную рубашку,
 * должна узнавать свой чат по той же красной плашке.
 *
 * Три решения, которые стоит объяснить.
 *
 * **Заливка во всю площадь, а не цветное кольцо на тёмном.** В
 * списке чатов аватарка занимает сорок пикселей. Тёмный кружок с
 * тонким акцентом на этом размере читается как тёмный кружок;
 * сплошной цвет — как цвет команды.
 *
 * **Знак вписан в круг, а не в квадрат.** Telegram обрезает
 * аватарку по кругу почти везде, и всё, что легло в углы, теряется.
 * Знак занимает 58% ширины и стоит по центру — в круг попадает
 * целиком.
 *
 * **Общий чат сделан наоборот**: тёмный холст и цветной знак. Он
 * один такой в списке и не притворяется седьмой командой.
 *
 * Запуск:
 *
 *   node scripts/team-avatars.mjs [папка]
 *
 * По умолчанию кладёт в brand/telegram/.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { TEAM_COLORS, teamColorHex, teamColorLabel } from '../lib/team-colors.ts';

const OUT = process.argv[2] ?? 'brand/telegram';
const SIZE = 1024;

const CANVAS = '#060609';
const SIGNAL = '#FF00B3';
const INK = '#F5F5F1';

/** Картинки уходят в страницу как data:, иначе браузеру негде их взять. */
async function dataUrl(path) {
  const bytes = await readFile(path);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function page({ fill, mark, ornament, ornamentOpacity }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; }
    body { width: ${SIZE}px; height: ${SIZE}px; overflow: hidden; }
    .plate {
      position: relative;
      width: ${SIZE}px; height: ${SIZE}px;
      background: ${fill};
      display: flex; align-items: center; justify-content: center;
    }
    /* Орнамент — тот же приём, что на рубашке карточки:
       одноцветный силуэт знака плиткой под низкой непрозрачностью. */
    .ornament {
      position: absolute; inset: 0;
      background-image: url("${ornament}");
      background-size: 176px auto;
      opacity: ${ornamentOpacity};
    }
    .mark { position: relative; width: 58%; display: block; }
  </style></head><body>
    <div class="plate">
      <div class="ornament"></div>
      <img class="mark" src="${mark}">
    </div>
  </body></html>`;
}

const monoPath = 'public/brand/dvizh-leipzig-mono.png';
const colorPath = 'public/brand/dvizh-leipzig.png';

const mono = await dataUrl(monoPath);
const color = await dataUrl(colorPath);

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const context = await browser.newContext({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});
const tab = await context.newPage();

async function render(name, html) {
  await tab.setContent(html, { waitUntil: 'networkidle' });
  await tab.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  ${name}.png`);
}

console.log(`Аватарки в ${OUT}/`);

// Общий чат: тёмный холст, цветной знак.
await render(
  '00-obshchiy',
  page({ fill: CANVAS, mark: color, ornament: mono, ornamentOpacity: 0.07 }),
);

// Команды: рубашка своего цвета.
for (const [index, team] of TEAM_COLORS.slice(0, 6).entries()) {
  await render(
    `${String(index + 1).padStart(2, '0')}-${team}`,
    page({ fill: teamColorHex(team), mark: mono, ornament: mono, ornamentOpacity: 0.12 }),
  );
}

await browser.close();

// Рядом с картинками — расшифровка, какая какой команде.
const legend = TEAM_COLORS.slice(0, 6)
  .map((team, i) => `${String(i + 1).padStart(2, '0')}-${team}.png — ${teamColorLabel(team)} (${teamColorHex(team)})`)
  .join('\n');

await writeFile(
  join(OUT, 'ЦВЕТА.txt'),
  `Аватарки чатов Telegram, ${SIZE}×${SIZE}.\n\n` +
    `00-obshchiy.png — общий чат: тёмный холст, цветной знак\n${legend}\n\n` +
    'Цвет назначается командам по порядку, тем же, что в lib/team-colors.ts\n' +
    'и в перечислении team_color: первая заведённая команда получает\n' +
    'красный, вторая зелёный и так далее. Проверить, кому что досталось:\n\n' +
    '  select name, color from public.teams order by created_at;\n' +
    `\nЗнак вписан в круг: Telegram обрезает аватарку по кругу, и углы\nтеряются. Пересобрать — node scripts/team-avatars.mjs\n`,
  'utf8',
);
console.log('  ЦВЕТА.txt');
