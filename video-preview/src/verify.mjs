/**
 * Проверка готового файла.
 *
 * Сверяет то, что просит бриф: длительность, размер кадра, частоту,
 * кодеки, каналы, пиксельный формат. И собирает контрольный лист
 * кадров, чтобы глазами убедиться, что в ролике именно приложение,
 * а не пустой экран.
 */

import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = process.argv[2] ?? path.join(ROOT, 'output/dvizh-patrol-app-preview.mp4');
const SHEET = path.join(ROOT, 'output/contact-sheet.jpg');

/** Кадры из брифа: по ним видно каждую сцену. */
const MARKS = [1, 3, 5, 8, 10, 12, 15, 18, 20, 22, 23.5];

const EXPECTED = {
  duration: 24,
  width: 1080,
  height: 1920,
  fps: 30,
  video: 'h264',
  audio: 'aac',
  channels: 2,
  pixelFormat: 'yuv420p',
};

async function probe() {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate',
    '-show_entries', 'stream=codec_name,codec_type,width,height,r_frame_rate,pix_fmt,channels,sample_rate,nb_frames',
    '-of', 'json',
    FILE,
  ]);
  return JSON.parse(stdout);
}

const info = await probe();
const video = info.streams.find((s) => s.codec_type === 'video');
const audio = info.streams.find((s) => s.codec_type === 'audio');
const [num, den] = video.r_frame_rate.split('/').map(Number);

const checks = [
  ['длительность', Number(info.format.duration).toFixed(3), EXPECTED.duration.toFixed(3)],
  ['ширина', video.width, EXPECTED.width],
  ['высота', video.height, EXPECTED.height],
  ['кадров в секунду', num / den, EXPECTED.fps],
  ['кадров всего', Number(video.nb_frames), EXPECTED.duration * EXPECTED.fps],
  ['видеокодек', video.codec_name, EXPECTED.video],
  ['пиксельный формат', video.pix_fmt, EXPECTED.pixelFormat],
  ['аудиокодек', audio?.codec_name, EXPECTED.audio],
  ['каналов', audio?.channels, EXPECTED.channels],
];

let failed = 0;
process.stdout.write(`Файл: ${FILE}\n`);
process.stdout.write(`Размер: ${(Number(info.format.size) / 1024 / 1024).toFixed(2)} МБ\n\n`);

for (const [label, actual, expected] of checks) {
  const ok = String(actual) === String(expected);
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? '  ✓' : '  ✗'} ${label}: ${actual}${ok ? '' : ` (ждали ${expected})`}\n`);
}

// ═══ Контрольный лист ══════════════════════════════════════════

await mkdir(path.dirname(SHEET), { recursive: true });

const frames = [];
for (const [index, second] of MARKS.entries()) {
  const file = path.join(ROOT, 'scratch', `mark-${index}.png`);
  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-ss', String(second),
    '-i', FILE,
    '-frames:v', '1',
    '-vf', 'scale=360:640',
    file,
  ]);
  frames.push(file);
}

const inputs = frames.flatMap((file) => ['-i', file]);
const labels = MARKS.map((second) => `${second.toFixed(1)} c`);

await run('ffmpeg', [
  '-y', '-loglevel', 'error',
  ...inputs,
  '-filter_complex',
  frames
    .map(
      (_, index) =>
        `[${index}:v]drawtext=text='${labels[index]}':fontsize=26:fontcolor=0xff00b3:` +
        `x=12:y=12:box=1:boxcolor=0x060609@0.85:boxborderw=8[t${index}]`,
    )
    .join(';') +
    ';' +
    frames.map((_, index) => `[t${index}]`).join('') +
    `xstack=inputs=${frames.length}:layout=` +
    frames
      .map((_, index) => `${(index % 6) * 360}_${Math.floor(index / 6) * 640}`)
      .join('|') +
    ':fill=black',
  '-q:v', '3',
  SHEET,
]);

process.stdout.write(`\nКонтрольный лист: ${SHEET}\n`);

if (failed > 0) {
  process.stderr.write(`\nНе сошлось пунктов: ${failed}\n`);
  process.exit(1);
}
process.stdout.write('\nВсе технические требования выполнены.\n');
