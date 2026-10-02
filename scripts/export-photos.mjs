#!/usr/bin/env node
/**
 * Выгрузка всех фотографий квеста одним архивом.
 *
 * Снимки лежат в закрытом бакете под именами вида
 * `events/…/teams/…/tasks/…/{id}.jpg` — по такому имени человек не
 * поймёт ничего. Скрипт раскладывает их по папкам команд и даёт
 * файлам говорящие имена:
 *
 *   Фанаты Маруси/
 *     059 — Ратуша, которая старше.jpg
 *     038 — Круглое окно (не зачтено, попытка 2).jpg
 *
 * Рядом кладётся `manifest.csv` — тот же список таблицей, со
 * статусом, баллами и временем отправки. Он нужен затем, что имя
 * файла всё-таки не документ: если снимок понадобится соотнести с
 * начислением или спором, таблица отвечает точнее.
 *
 * По умолчанию выгружается всё, что люди отправили, — и зачтённое,
 * и отклонённое. Отклонённые кадры тоже часть вечера, а какие из
 * них потом выложить, решает человек, а не скрипт.
 *
 * Запуск:
 *
 *   SUPABASE_URL=https://…supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   node scripts/export-photos.mjs
 *
 * Ключ сервисной роли берётся из окружения и никуда не пишется —
 * ни в архив, ни в манифест. В репозитории его быть не должно: он
 * лежит в настройках Vercel и в панели Supabase, оттуда и
 * копируйте в команду запуска.
 *
 * Флаги:
 *   --out <папка>   куда складывать (по умолчанию ./export-photos)
 *   --accepted      только зачтённые снимки
 *   --previews      мелкие превью вместо оригиналов (в десять раз легче)
 *   --no-zip        оставить папкой, не паковать
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));

function option(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}

const OUT = resolve(option('--out', './export-photos'));
const ONLY_ACCEPTED = flags.has('--accepted');
const PREVIEWS = flags.has('--previews');
const ZIP = !flags.has('--no-zip');

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error(
    '\n  ✗ Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.\n' +
      '    Панель Supabase → Project Settings → API.\n',
  );
  process.exit(1);
}

const BUCKET = PREVIEWS ? 'submission-previews' : 'submission-images';

/** Сколько файлов тянуть разом. Больше — упираемся в лимиты хранилища. */
const CONCURRENCY = 4;

// ═══ Запросы ═══════════════════════════════════════════════════

async function rest(path) {
  const response = await fetch(`${URL_BASE}${path}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GET ${path} → ${response.status} ${body.slice(0, 200)}`);
  }
  return response;
}

async function loadSubmissions() {
  const select =
    'id,status,attempt_number,awarded_points,submitted_at,image_path,preview_path,' +
    'teams(name),tasks(number,title)';

  const response = await rest(
    `/rest/v1/submissions?select=${encodeURIComponent(select)}&order=submitted_at.asc`,
  );

  return response.json();
}

// ═══ Имена файлов ══════════════════════════════════════════════

/**
 * Имя, которое переживёт любую файловую систему.
 *
 * Windows запрещает больше символов, чем Linux, и архив, собранный
 * здесь, распаковывают чаще всего именно там. Поэтому режем по
 * самому строгому набору, а не по своему.
 */
function safeName(value) {
  return (
    String(value ?? '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[. ]+|[. ]+$/g, '')
      .slice(0, 80) || 'без названия'
  );
}

const STATUS = {
  accepted: null, // зачтённое не помечаем: это норма, а не особый случай
  rejected: 'не зачтено',
  manual_review: 'на ручной проверке',
  pending: 'не проверено',
  checking: 'не проверено',
  uploading: 'не долетело',
};

function fileNameFor(row) {
  const number = String(row.tasks?.number ?? 0).padStart(3, '0');
  const title = safeName(row.tasks?.title ?? 'задание');

  const marks = [];
  const status = STATUS[row.status];
  if (status) marks.push(status);
  if ((row.attempt_number ?? 1) > 1) marks.push(`попытка ${row.attempt_number}`);

  const suffix = marks.length > 0 ? ` (${marks.join(', ')})` : '';
  const ext = (row.image_path ?? '').split('.').pop()?.toLowerCase() ?? 'jpg';

  return `${number} — ${title}${suffix}.${ext.length <= 4 ? ext : 'jpg'}`;
}

// ═══ Скачивание ════════════════════════════════════════════════

async function download(path) {
  const response = await fetch(
    `${URL_BASE}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } },
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`${response.status} ${(await response.text().catch(() => '')).slice(0, 120)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Очередь на несколько потоков.
 *
 * Своя, а не библиотека: одна функция на десять строк дешевле
 * зависимости, а поведение здесь нужно самое простое — взял
 * следующий, скачал, повторил.
 */
async function inParallel(items, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

// ═══ Манифест ══════════════════════════════════════════════════

function csvCell(value) {
  const text = String(value ?? '');
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function manifest(rows) {
  const header = [
    'Команда',
    'Задание',
    'Название',
    'Статус',
    'Баллы',
    'Попытка',
    'Отправлено',
    'Файл в архиве',
    'Путь в хранилище',
  ];

  const lines = rows.map((row) =>
    [
      row.teams?.name,
      row.tasks?.number,
      row.tasks?.title,
      row.status,
      row.awarded_points,
      row.attempt_number,
      row.submitted_at,
      row.savedAs ?? '',
      row.image_path,
    ]
      .map(csvCell)
      .join(','),
  );

  // BOM: без него Excel открывает кириллицу кракозябрами.
  return `﻿${[header.join(','), ...lines].join('\n')}\n`;
}

// ═══ Упаковка ══════════════════════════════════════════════════

function run(command, commandArgs, cwd) {
  return new Promise((done) => {
    const child = spawn(command, commandArgs, { cwd, stdio: 'ignore' });
    child.on('error', () => done(false));
    child.on('close', (code) => done(code === 0));
  });
}

// ═══ Главное ═══════════════════════════════════════════════════

async function main() {
  console.log(`\n  Читаю список отправок…`);

  let rows = await loadSubmissions();
  if (ONLY_ACCEPTED) rows = rows.filter((row) => row.status === 'accepted');

  const pathKey = PREVIEWS ? 'preview_path' : 'image_path';
  rows = rows.filter((row) => row[pathKey]);

  if (rows.length === 0) {
    console.log('  Нечего выгружать.\n');
    return;
  }

  const teams = new Set(rows.map((row) => row.teams?.name ?? 'без команды'));
  console.log(`  Отправок со снимком: ${rows.length}, команд: ${teams.size}`);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const taken = new Set();
  let saved = 0;
  const missing = [];
  const failed = [];

  await inParallel(rows, async (row) => {
    const team = safeName(row.teams?.name ?? 'без команды');

    // Столкновение имён возможно: одна команда могла отправить по
    // заданию две фотографии с одинаковой пометкой. Проигравший в
    // гонке за имя получает числовой хвост, а не затирает соседа.
    let name = fileNameFor(row);
    let attempt = 2;
    while (taken.has(`${team}/${name}`)) {
      name = fileNameFor(row).replace(/(\.[^.]+)$/, ` (${attempt})$1`);
      attempt += 1;
    }
    taken.add(`${team}/${name}`);

    try {
      const body = await download(row[pathKey]);
      if (!body) {
        missing.push(row);
        return;
      }

      await mkdir(join(OUT, team), { recursive: true });
      await writeFile(join(OUT, team, name), body);

      row.savedAs = `${team}/${name}`;
      saved += 1;
      process.stdout.write(`\r  Скачано: ${saved}/${rows.length}   `);
    } catch (error) {
      failed.push({ row, error: error.message });
    }
  });

  process.stdout.write('\n');

  await writeFile(join(OUT, 'manifest.csv'), manifest(rows), 'utf8');

  if (missing.length > 0) {
    console.log(`  Нет файла в хранилище: ${missing.length}`);
    for (const row of missing.slice(0, 10)) {
      console.log(`    задание ${row.tasks?.number} · ${row.teams?.name} · ${row.status}`);
    }
    if (missing.length > 10) console.log(`    …и ещё ${missing.length - 10}`);
    console.log('    Это отправки, у которых загрузка не завершилась. Снимка не существует.');
  }

  for (const item of failed) {
    console.log(`  ✗ задание ${item.row.tasks?.number}: ${item.error}`);
  }

  if (!ZIP) {
    console.log(`\n  Готово: ${OUT}\n`);
    return;
  }

  const archive = `${OUT}.zip`;
  await rm(archive, { force: true });

  const zipped = await run('zip', ['-rq', archive, OUT.split('/').pop()], resolve(OUT, '..'));

  if (zipped) {
    console.log(`\n  Готово: ${archive}\n`);
    return;
  }

  // `zip` есть не везде — на Windows его обычно нет вовсе. Папка
  // уже собрана, и упаковать её человек может сам одной командой.
  console.log(
    `\n  Папка собрана: ${OUT}` +
      `\n  Упаковщик zip не найден. Заархивируйте сами:` +
      `\n    Windows PowerShell:  Compress-Archive -Path "${OUT}" -DestinationPath "${archive}"` +
      `\n    macOS:               в Finder правой кнопкой → «Сжать»\n`,
  );
}

main().catch((error) => {
  console.error(`\n  ✗ ${error.message}\n`);
  process.exit(1);
});
