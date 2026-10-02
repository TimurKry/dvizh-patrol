#!/usr/bin/env node
/**
 * Загрузка эталонных фотографий пачкой.
 *
 * Через админку картинка добавляется в четыре действия: открыть
 * задание, пролистать до блока, выбрать файл, дождаться. На одно
 * задание это полминуты, на полсотни — вечер. Фотографии при этом
 * может собрать только человек: их надо снять или найти, и никакой
 * скрипт этого не сделает.
 *
 * Поэтому здесь ровно то, что можно снять с человека, — повторение.
 * Кладёте файлы в папку, называя их по номеру задания, запускаете
 * один раз.
 *
 *   references/
 *     54.jpg        → задание №54, первая картинка (она и на карточке)
 *     54-2.jpg      → второй кадр того же задания
 *     58.png        → задание №58
 *
 * Порядок внутри задания — по суффиксу: без суффикса идёт первой,
 * дальше -2, -3. Первая картинка попадает на карточку в руке
 * команды, остальные видны на странице задания.
 *
 * Запуск:
 *
 *   SUPABASE_URL=https://…supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   node scripts/upload-references.mjs ./references
 *
 * Ключ сервисной роли берётся из переменных окружения и никуда не
 * записывается. В репозитории его быть не должно — он лежит в
 * настройках Vercel, оттуда его и копируйте в команду запуска.
 *
 * Флаги:
 *   --replace   заменить уже загруженные картинки задания
 *   --dry-run   показать, что будет сделано, ничего не трогая
 */

import { createHash, randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const dir = args.find((a) => !a.startsWith('--')) ?? './references';

const DRY = flags.has('--dry-run');
const REPLACE = flags.has('--replace');

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  fail(
    'Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Возьмите их в настройках проекта Supabase и передайте в команду запуска.',
  );
}

const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Тот же потолок, что у загрузки через админку. */
const MAX_BYTES = 3 * 1024 * 1024;

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

async function rest(path, init = {}) {
  const response = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${body.slice(0, 200)}`);
  }
  return response;
}

/** Разбор имени: «54.jpg» → 54 / порядок 0, «54-2.jpg» → 54 / 1. */
function parseName(file) {
  const ext = extname(file).toLowerCase();
  const type = TYPES[ext];
  if (!type) return null;

  const stem = basename(file, extname(file));
  const match = /^(\d+)(?:-(\d+))?$/.exec(stem);
  if (!match) return null;

  return {
    number: Number(match[1]),
    order: match[2] ? Number(match[2]) - 1 : 0,
    type,
  };
}

const files = await readdir(dir).catch(() => fail(`Папка ${dir} не найдена.`));

const planned = [];
const skipped = [];

for (const file of files.sort()) {
  const parsed = parseName(file);
  if (!parsed) {
    skipped.push(`${file} — имя не похоже на «номер задания», пропущен`);
    continue;
  }
  planned.push({ file, ...parsed });
}

if (planned.length === 0) {
  fail(`В ${dir} нет подходящих файлов. Назовите их по номеру задания: 54.jpg, 54-2.jpg, 58.png.`);
}

// ─── Сверяем номера с базой одним запросом ─────────────────────

const numbers = [...new Set(planned.map((p) => p.number))];
const tasks = await rest(
  `/rest/v1/tasks?select=id,number,event_id&number=in.(${numbers.join(',')})&active=eq.true`,
).then((r) => r.json());

const byNumber = new Map(tasks.map((t) => [t.number, t]));
const missing = numbers.filter((n) => !byNumber.has(n));
if (missing.length) {
  fail(`Нет активных заданий с номерами: ${missing.join(', ')}. Проверьте имена файлов.`);
}

// ─── Что уже загружено ─────────────────────────────────────────

const taskIds = [...new Set(tasks.map((t) => t.id))];
const existing = await rest(
  `/rest/v1/task_reference_images?select=id,task_id,image_path,sort_order&task_id=in.(${taskIds.join(',')})`,
).then((r) => r.json());

const existingByTask = new Map();
for (const row of existing) {
  const list = existingByTask.get(row.task_id) ?? [];
  list.push(row);
  existingByTask.set(row.task_id, list);
}

// ─── Работа ────────────────────────────────────────────────────

console.log(`\n  Папка: ${dir}`);
console.log(`  Файлов к загрузке: ${planned.length}${DRY ? '  (пробный прогон)' : ''}\n`);
for (const line of skipped) console.log(`  · ${line}`);

let uploaded = 0;
let left = 0;

for (const item of planned.sort((a, b) => a.number - b.number || a.order - b.order)) {
  const task = byNumber.get(item.number);
  const already = existingByTask.get(task.id) ?? [];

  if (already.length > 0 && !REPLACE) {
    console.log(
      `  · №${item.number}: уже есть ${already.length} шт., пропускаю (--replace заменит)`,
    );
    left += 1;
    continue;
  }

  const bytes = await readFile(join(dir, item.file));
  if (bytes.byteLength > MAX_BYTES) {
    console.log(
      `  ✗ №${item.number}: ${item.file} весит ${(bytes.byteLength / 1048576).toFixed(1)} МБ, ` +
        `потолок 3 МБ. Сожмите и повторите.`,
    );
    continue;
  }

  const imageId = randomBytes(8).toString('hex');
  const path = `events/${task.event_id}/tasks/${task.id}/${imageId}.${EXT[item.type]}`;

  if (DRY) {
    console.log(`  → №${item.number}: ${item.file} → ${path}`);
    uploaded += 1;
    continue;
  }

  // Замена: сначала убираем старое, иначе первой на карточке
  // останется прежняя картинка.
  if (already.length > 0 && REPLACE && item.order === 0) {
    for (const row of already) {
      await rest(`/storage/v1/object/task-reference-images/${row.image_path}`, {
        method: 'DELETE',
      }).catch(() => {});
      await rest(`/rest/v1/task_reference_images?id=eq.${row.id}`, { method: 'DELETE' });
    }
    existingByTask.set(task.id, []);
  }

  await rest(`/storage/v1/object/task-reference-images/${path}`, {
    method: 'POST',
    headers: { 'content-type': item.type },
    body: bytes,
  });

  await rest('/rest/v1/task_reference_images', {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({
      task_id: task.id,
      image_path: path,
      caption: null,
      sort_order: item.order,
    }),
  });

  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  console.log(`  ✓ №${item.number}: ${item.file} → ${EXT[item.type]}, ${digest}`);
  uploaded += 1;
}

console.log(
  `\n  Готово: ${uploaded} загружено${left ? `, ${left} пропущено как уже заполненные` : ''}.\n`,
);
