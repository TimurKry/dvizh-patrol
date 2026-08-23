/**
 * Монтаж ролика.
 *
 * Три прохода, а не один гигантский filter_complex: так каждый шаг
 * можно пересобрать и посмотреть отдельно.
 *
 *   1. Куски. Каждая сцена обрезается, при необходимости
 *      ускоряется и кладётся на подложку 1080×1920.
 *   2. Склейка. Куски сшиваются concat-демуксером — параметры у
 *      всех одинаковые, перекодирования не требуется.
 *   3. Подписи и звук. Слои PNG с прозрачностью и готовая дорожка.
 *
 * Экран телефона — 1170×2532. В кадр 9:16 он не влезает ни целиком,
 * ни без потерь: обрезать по ширине значит срезать шапку и нижнюю
 * навигацию, то есть ровно то, что ролик и показывает. Поэтому
 * запись вписывается по высоте (846×1830) на фирменную подложку, и
 * ни один пиксель интерфейса не теряется.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCENES = path.join(ROOT, 'scratch/scenes');
const OVERLAYS = path.join(ROOT, 'scratch/overlays');
const PARTS = path.join(ROOT, 'scratch/parts');
const OUTPUT = path.join(ROOT, 'output');

const W = 1080;
const H = 1920;
const FPS = 30;
/** Куда и в каком размере ложится запись экрана. */
const SCREEN = { width: 846, height: 1830, x: 117, y: 45 };

// ═══ Монтажный лист ════════════════════════════════════════════
//
// `in` — секунда внутри исходной сцены, `src` — сколько взять,
// `out` — сколько это займёт в ролике. src ≠ out означает ускорение.
// Сумма `out` обязана быть ровно 24,000 с.

const EDIT = [
  // 0:00–1:80 · Хук: маршрут, полароиды, заголовок, знак.
  { scene: 'title-hook', in: 3.10, src: 1.8, out: 1.8, note: 'Город становится игрой' },

  // 1:80–2:40 · Лендинг — не больше секунды, как и просили.
  { scene: 'landing', in: 1.05, src: 1.0, out: 0.6, note: 'лендинг' },

  // 2:40–4:30 · Вход по коду.
  { scene: 'join', in: 1.55, src: 3.3, out: 1.9, note: 'шесть символов, вход' },

  // 4:30–7:00 · Экран команды.
  { scene: 'team', in: 1.0, src: 3.6, out: 2.7, note: 'команда, баллы, прогресс' },

  // 7:00–11:00 · Карточки: расклад и два переворота.
  { scene: 'hand', in: 1.45, src: 0.9, out: 0.6, note: 'расклад рубашками вверх' },
  { scene: 'hand', in: 2.3, src: 2.6, out: 1.9, note: 'переворот фото-повтора' },
  { scene: 'hand', in: 6.95, src: 2.4, out: 1.5, note: 'переворот загадки' },

  // 11:00–13:90 · Открытие задания.
  { scene: 'open-task', in: 4.0, src: 4.1, out: 2.9, note: 'страница задания' },

  // 13:90–17:00 · Карта. Двумя кусками: сначала поле и
  // приближение, потом выбранная метка с подписью задания —
  // одним куском подпись успевала бы мелькнуть.
  { scene: 'map', in: 1.9, src: 2.6, out: 1.6, note: 'игровое поле, приближение' },
  { scene: 'map', in: 6.2, src: 2.4, out: 1.5, note: 'метка задания и подпись' },

  // 17:00–18:50 · Фотография и отправка.
  { scene: 'upload', in: 2.85, src: 0.8, out: 0.6, note: 'предпросмотр снимка' },
  { scene: 'upload', in: 4.75, src: 1.2, out: 0.9, note: 'отправка' },

  // 18:50–19:40 · На проверке.
  { scene: 'in-review', in: 1.5, src: 1.2, out: 0.9, note: 'ручная проверка' },

  // 19:40–20:10 · Организатор.
  { scene: 'admin', in: 3.9, src: 1.0, out: 0.7, note: 'очередь проверки' },

  // 20:10–21:30 · Засчитано.
  { scene: 'accepted', in: 1.6, src: 1.6, out: 1.2, note: 'начислено 160 баллов' },

  // 21:30–21:90 · Баллы команды.
  { scene: 'team-after', in: 1.2, src: 0.8, out: 0.6, note: '610 баллов' },

  // 21:90–23:00 · Рейтинг: было второе место — стало первое.
  { scene: 'board-before', in: 1.4, src: 0.5, out: 0.5, note: 'второе место' },
  { scene: 'board-after', in: 1.4, src: 0.6, out: 0.6, note: 'первое место' },

  // 23:00–24:00 · Финальная плашка.
  { scene: 'title-cta', in: 2.57, src: 1.0, out: 1.0, note: 'дата, город, цена, ссылка' },
];

// ═══ Подписи ═══════════════════════════════════════════════════
//
// `at` и `until` — секунды готового ролика.

const CAPTIONS = [
  { name: 'join', at: 2.55, until: 4.2 },
  { name: 'team', at: 4.55, until: 6.85 },
  { name: 'photo', at: 7.15, until: 8.85 },
  { name: 'riddle', at: 9.1, until: 10.5 },
  { name: 'pool', at: 10.55, until: 10.95 },
  { name: 'choose', at: 11.15, until: 13.7 },
  { name: 'route', at: 14.05, until: 16.85 },
  { name: 'send', at: 17.1, until: 18.4 },
  { name: 'review', at: 18.55, until: 19.35 },
  { name: 'admin', at: 19.45, until: 20.05 },
  { name: 'scored', at: 20.2, until: 21.25 },
  { name: 'board', at: 21.35, until: 22.9 },
];

/** Вспышка сигнальным цветом — ровно в момент «засчитано». */
const FLASH = { at: 20.12, duration: 0.22 };

// ═══ Запуск ffmpeg ═════════════════════════════════════════════

function run(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    ffmpeg.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}\n${stderr}`)),
    );
  });
}

// ═══ 1 · Куски ═════════════════════════════════════════════════

async function buildParts() {
  await rm(PARTS, { recursive: true, force: true });
  await mkdir(PARTS, { recursive: true });

  const plate = path.join(OVERLAYS, 'plate.png');
  const list = [];

  for (const [index, cut] of EDIT.entries()) {
    const source = path.join(SCENES, `${cut.scene}.mp4`);
    const file = path.join(PARTS, `${String(index).padStart(2, '0')}-${cut.scene}.mp4`);
    const speed = cut.out / cut.src;

    await run([
      '-y',
      '-loop', '1',
      '-i', plate,
      '-ss', String(cut.in),
      '-t', String(cut.src),
      '-i', source,
      '-filter_complex',
      // tpad клонирует последний кадр: после ускорения кусок иногда
      // оказывается на кадр-два короче нужного, и без запаса
      // `-frames:v` нечего было бы взять.
      `[1:v]setpts=PTS*${speed.toFixed(6)},fps=${FPS},` +
        `tpad=stop_mode=clone:stop_duration=0.4,` +
        `scale=${SCREEN.width}:${SCREEN.height}:flags=lanczos,setsar=1[phone];` +
        `[0:v]scale=${W}:${H},setsar=1[bg];` +
        `[bg][phone]overlay=${SCREEN.x}:${SCREEN.y}:shortest=1,format=yuv420p[v]`,
      '-map', '[v]',
      // Не `-t`: он режет по времени, и кадр, попавший ровно на
      // границу, теряется — за восемнадцать кусков набегает
      // треть секунды. Считаем кадры.
      '-frames:v', String(Math.round(cut.out * FPS)),
      '-r', String(FPS),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '16',
      '-pix_fmt', 'yuv420p',
      file,
    ]);

    list.push(file);
    process.stdout.write(
      `  · ${String(index).padStart(2, '0')} ${cut.scene} — ${cut.out.toFixed(2)} c` +
        `${Math.abs(speed - 1) > 0.02 ? ` ×${(1 / speed).toFixed(2)}` : ''} · ${cut.note}\n`,
    );
  }

  return list;
}

// ═══ 2 · Склейка ═══════════════════════════════════════════════

async function concat(parts) {
  const listFile = path.join(PARTS, 'parts.txt');
  await writeFile(listFile, parts.map((file) => `file '${file}'`).join('\n'));

  const joined = path.join(PARTS, 'joined.mp4');
  await run([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-c', 'copy',
    joined,
  ]);
  return joined;
}

// ═══ 3 · Подписи и звук ════════════════════════════════════════

async function finish(joined) {
  await mkdir(OUTPUT, { recursive: true });
  const target = path.join(OUTPUT, 'dvizh-patrol-app-preview.mp4');

  const inputs = ['-i', joined];
  const filters = [];
  let last = '0:v';

  for (const [index, caption] of CAPTIONS.entries()) {
    const duration = caption.until - caption.at;
    const fade = Math.min(0.2, duration / 3);
    inputs.push('-loop', '1', '-t', String(duration), '-i', path.join(OVERLAYS, `${caption.name}.png`));

    const stream = index + 1;
    filters.push(
      `[${stream}:v]format=rgba,` +
        `fade=t=in:st=0:d=${fade}:alpha=1,` +
        `fade=t=out:st=${(duration - fade).toFixed(3)}:d=${fade}:alpha=1,` +
        `setpts=PTS-STARTPTS+${caption.at}/TB[c${index}]`,
    );
    filters.push(
      `[${last}][c${index}]overlay=0:0:enable='between(t,${caption.at},${caption.until})'[v${index}]`,
    );
    last = `v${index}`;
  }

  // Вспышка на подтверждении: короткая, поверх всего.
  filters.push(
    `color=c=0xff00b3:s=${W}x${H}:d=${FLASH.duration}:r=${FPS},format=rgba,` +
      `fade=t=in:st=0:d=${(FLASH.duration / 2).toFixed(3)}:alpha=1,` +
      `fade=t=out:st=${(FLASH.duration / 2).toFixed(3)}:d=${(FLASH.duration / 2).toFixed(3)}:alpha=1,` +
      `colorchannelmixer=aa=0.55,setpts=PTS-STARTPTS+${FLASH.at}/TB[flash]`,
  );
  filters.push(
    `[${last}][flash]overlay=0:0:enable='between(t,${FLASH.at},${(FLASH.at + FLASH.duration).toFixed(3)})'[vout]`,
  );

  await run([
    '-y',
    ...inputs,
    '-i', path.join(ROOT, 'assets/audio/soundtrack.wav'),
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', `${CAPTIONS.length + 1}:a`,
    '-t', '24',
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.0',
    '-preset', 'slow',
    '-crf', '19',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    target,
  ]);

  return target;
}

// ═══ Сборка ════════════════════════════════════════════════════

const total = EDIT.reduce((sum, cut) => sum + cut.out, 0);
if (Math.abs(total - 24) > 0.001) {
  process.stderr.write(`Монтажный лист даёт ${total.toFixed(3)} с вместо 24,000\n`);
  process.exit(1);
}

process.stdout.write('Куски:\n');
const parts = await buildParts();

process.stdout.write('Склейка…\n');
const joined = await concat(parts);

process.stdout.write('Подписи и звук…\n');
const target = await finish(joined);

process.stdout.write(`\nГотово: ${target}\n`);
