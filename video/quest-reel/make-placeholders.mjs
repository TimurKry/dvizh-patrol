#!/usr/bin/env node
/**
 * Демо-материал, чтобы ролик собирался без настоящих фотографий.
 *
 * Снимки квеста лежат в закрытом хранилище и в репозиторий не
 * попадают — ни по весу, ни по смыслу: это лица людей. Но проект
 * должен запускаться у любого, кто его открыл, иначе «посмотреть,
 * как выглядит» превращается в «сначала достань девяносто семь
 * мегабайт».
 *
 * Заглушки нарочно непохожи на фотографии: заливка, номер, полосы.
 * Спутать их с настоящим кадром невозможно, а верстку они проверяют
 * полностью — и вертикальные, и горизонтальные, и квадратные.
 *
 *   node make-placeholders.mjs [сколько]
 *
 * Настоящий материал кладётся на то же место командой
 * `scripts/export-video-pairs.mjs` из корня репозитория.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const COUNT = Number(process.argv[2] ?? 8);
const OUT = join(import.meta.dirname, 'public', 'pairs');

const TEAMS = [
  { name: 'Клуб убийц по субботам', color: 'red' },
  { name: 'Зелёная команда', color: 'green' },
  { name: 'Коржики', color: 'yellow' },
  { name: 'Розовая команда', color: 'pink' },
  { name: 'Фанаты Маруси', color: 'teal' },
];

const TITLES = [
  'Ратуша, которая старше',
  'Повтори мем',
  'Круглое окно',
  'Отражение',
  'Город звучит',
  'Первая высотка',
  'Рыцарь под ногами',
  'Эркер',
];

const HEX = {
  red: '#FF3B30',
  green: '#21C55D',
  yellow: '#FFD400',
  pink: '#FF00B3',
  teal: '#12CFC0',
};

/** Разные пропорции: телефон снимает и так, и так. */
const SHAPES = [
  [1080, 1440],
  [1080, 810],
  [1080, 1080],
  [810, 1080],
];

function placeholder({ width, height, accent, caption, big }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1b1b22"/>
          <stop offset="100%" stop-color="#0a0a0e"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      ${Array.from(
        { length: 9 },
        (_, i) =>
          `<rect x="0" y="${(height / 9) * i}" width="100%" height="2" fill="${accent}" opacity="0.14"/>`,
      ).join('')}
      <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.28}"
              fill="none" stroke="${accent}" stroke-width="6" opacity="0.5"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
            font-family="Arial Black, sans-serif" font-size="${Math.min(width, height) * 0.3}"
            fill="${accent}" opacity="0.92">${big}</text>
      <text x="50%" y="${height - 46}" text-anchor="middle"
            font-family="Arial, sans-serif" font-size="30" fill="#A3A3A8">${caption}</text>
    </svg>`,
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const pairs = [];

  for (let i = 0; i < COUNT; i += 1) {
    const slot = String(i + 1).padStart(2, '0');
    const team = TEAMS[i % TEAMS.length];
    const accent = HEX[team.color];
    const [width, height] = SHAPES[i % SHAPES.length];

    await sharp(placeholder({ width, height, accent, caption: 'кадр команды', big: slot }))
      .webp({ quality: 82 })
      .toFile(join(OUT, `${slot}-shot.webp`));

    // У каждой седьмой пары эталона нет — так бывает и в жизни,
    // и вёрстка обязана это переживать.
    const hasTask = i % 7 !== 6;
    if (hasTask) {
      await sharp(
        placeholder({ width: 900, height: 900, accent: '#F5F5F1', caption: 'эталон', big: '?' }),
      )
        .webp({ quality: 82 })
        .toFile(join(OUT, `${slot}-task.webp`));
    }

    pairs.push({
      slot,
      team: team.name,
      color: team.color,
      number: 10 + i * 7,
      title: TITLES[i % TITLES.length],
      cardType: 'photo',
      points: [20, 60, 70, 90, 120][i % 5],
      caption: null,
      task: hasTask ? `${slot}-task.webp` : null,
      shot: `${slot}-shot.webp`,
    });
  }

  await writeFile(join(OUT, 'pairs.json'), `${JSON.stringify(pairs, null, 2)}\n`);

  // Итоги финала — выдуманные, как и всё здесь. Настоящие пишет
  // выгрузка из базы.
  await writeFile(
    join(OUT, 'totals.json'),
    `${JSON.stringify({ photos: COUNT, teams: TEAMS.length, tasks: COUNT }, null, 2)}\n`,
  );

  console.log(`  Заглушки: ${COUNT} пар в ${OUT}`);
}

main();
