#!/usr/bin/env node
/**
 * Пары «задание → результат» для видеоролика.
 *
 * Отличается от `export-photos.mjs` целью, а не источником. Тот
 * отдаёт людям всё как есть — оригиналы, папки по командам, архив
 * на память. Этот собирает материал для монтажа: к каждому
 * зачтённому снимку подкладывает эталон задания (тот самый мем или
 * образец, который команда повторяла), ужимает обе картинки до
 * видеоразмера и пишет `pairs.json` с подписями.
 *
 * Ужимает намеренно. Оригиналы — 97 МБ, и для кадра 1080×1920 они
 * избыточны: разрешение выше кадра не улучшает картинку, а вес
 * решает, можно ли переслать материал целиком. После сжатия
 * тридцать пар весят около восьми мегабайт.
 *
 * Запуск:
 *
 *   SUPABASE_URL=https://…supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   node scripts/export-video-pairs.mjs
 *
 * Флаги:
 *   --out <папка>    куда складывать (по умолчанию ./video-pairs)
 *   --limit <n>      сколько пар взять (по умолчанию 30)
 *   --width <px>     длинная сторона картинки (по умолчанию 1080)
 *   --memes          только «Повтори мем» — их проще смотреть подряд
 *   --all-teams      не выравнивать по командам, брать подряд
 *   --no-zip         оставить папкой
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));

function option(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}

const OUT = resolve(option('--out', './video-pairs'));
const LIMIT = Number(option('--limit', '30'));
const WIDTH = Number(option('--width', '1080'));
const MEMES_ONLY = flags.has('--memes');
const EVEN_TEAMS = !flags.has('--all-teams');
const ZIP = !flags.has('--no-zip');

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error('\n  ✗ Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.\n');
  process.exit(1);
}

const CONCURRENCY = 4;

async function api(path) {
  const response = await fetch(`${URL_BASE}${path}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GET ${path} → ${response.status} ${body.slice(0, 200)}`);
  }
  return response;
}

/**
 * Сколько строк подходит под условие.
 *
 * Через заголовок `Content-Range`, а не через `select=count`:
 * агрегаты в PostgREST появились не сразу, и на старой версии
 * запрос молча искал бы колонку с именем `count`. Заголовок
 * работает везде и не тянет данные — просим одну строку.
 */
async function countOf(path) {
  const response = await fetch(`${URL_BASE}${path}`, {
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      prefer: 'count=exact',
      range: '0-0',
    },
  });

  const range = response.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function grab(bucket, path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${encoded}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${bucket}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Ужать под кадр.
 *
 * `withoutEnlargement` важен: часть снимков снята на телефон
 * вертикально и уже уже кадра. Растянуть их значило бы выдать мыло
 * за качество — пусть лучше монтаж сам решает, как их разместить.
 */
async function fit(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(WIDTH, WIDTH, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

async function inParallel(items, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index], index);
      }
    }),
  );
}

/**
 * Отобрать пары по кругу командам.
 *
 * Без этого подряд идут снимки одной команды: выгрузка
 * отсортирована по времени, а команды играли волнами. Ролик из
 * пяти кусков по одной команде смотрится как пять роликов.
 */
function roundRobin(rows, limit) {
  const byTeam = new Map();
  for (const row of rows) {
    const team = row.teams?.name ?? '—';
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(row);
  }

  const queues = [...byTeam.values()];
  const picked = [];

  while (picked.length < limit && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      if (picked.length >= limit) break;
      const next = queue.shift();
      if (next) picked.push(next);
    }
  }

  return picked;
}

async function main() {
  console.log('\n  Читаю зачтённые отправки…');

  const select =
    'id,status,awarded_points,submitted_at,image_path,teams(name,color),tasks(id,number,title,card_type)';

  const rows = await (
    await api(
      `/rest/v1/submissions?select=${encodeURIComponent(select)}` +
        `&status=eq.accepted&order=submitted_at.asc`,
    )
  ).json();

  const withPhoto = rows.filter((row) => row.image_path && row.tasks);
  const filtered = MEMES_ONLY
    ? withPhoto.filter((row) => /повтори мем/i.test(row.tasks.title ?? ''))
    : withPhoto;

  if (filtered.length === 0) {
    console.log('  Нечего выгружать.\n');
    return;
  }

  const chosen = EVEN_TEAMS
    ? roundRobin(filtered, LIMIT)
    : filtered.slice(0, LIMIT);

  console.log(`  Подходит: ${filtered.length}, беру: ${chosen.length}`);

  // Эталоны: одним запросом на все задания сразу, а не по одному
  // на пару — заданий меньше, чем отправок, и повторы неизбежны.
  const taskIds = [...new Set(chosen.map((row) => row.tasks.id))];
  const references = await (
    await api(
      `/rest/v1/task_reference_images?select=task_id,image_path,caption` +
        `&task_id=in.(${taskIds.join(',')})&order=created_at.asc`,
    )
  ).json();

  const referenceFor = new Map();
  for (const reference of references) {
    if (!referenceFor.has(reference.task_id)) referenceFor.set(reference.task_id, reference);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const pairs = [];
  let done = 0;

  await inParallel(chosen, async (row, index) => {
    const slot = String(index + 1).padStart(2, '0');

    try {
      const shotRaw = await grab('submission-images', row.image_path);
      if (!shotRaw) return;

      const reference = referenceFor.get(row.tasks.id);
      const taskRaw = reference ? await grab('task-reference-images', reference.image_path) : null;

      await writeFile(join(OUT, `${slot}-shot.webp`), await fit(shotRaw));
      if (taskRaw) await writeFile(join(OUT, `${slot}-task.webp`), await fit(taskRaw));

      pairs[index] = {
        slot,
        team: row.teams?.name ?? '',
        color: row.teams?.color ?? null,
        number: row.tasks.number,
        title: row.tasks.title,
        cardType: row.tasks.card_type,
        points: row.awarded_points,
        caption: reference?.caption ?? null,
        task: taskRaw ? `${slot}-task.webp` : null,
        shot: `${slot}-shot.webp`,
      };

      done += 1;
      process.stdout.write(`\r  Собрано пар: ${done}/${chosen.length}   `);
    } catch (error) {
      console.log(`\n  ✗ задание ${row.tasks.number}: ${error.message}`);
    }
  });

  process.stdout.write('\n');

  await writeFile(join(OUT, 'pairs.json'), `${JSON.stringify(pairs.filter(Boolean), null, 2)}\n`);

  // Итоги вечера целиком, а не по выборке: в ленту попадают
  // тридцать кадров, а на финальной плашке хочется видеть всё, что
  // команды успели.
  const [photos, claimed, teamCount] = await Promise.all([
    countOf('/rest/v1/submissions?select=id&image_path=not.is.null'),
    countOf('/rest/v1/tasks?select=id&claimed_by_team_id=not.is.null'),
    countOf('/rest/v1/teams?select=id'),
  ]);

  await writeFile(
    join(OUT, 'totals.json'),
    `${JSON.stringify({ photos, teams: teamCount, tasks: claimed }, null, 2)}\n`,
  );

  console.log(`  Итоги вечера: ${photos} фото, ${teamCount} команд, ${claimed} заданий взято.`);

  const withoutReference = pairs.filter(Boolean).filter((pair) => !pair.task).length;
  if (withoutReference > 0) {
    console.log(`  Без эталона: ${withoutReference} — в ролике покажем только результат.`);
  }

  if (!ZIP) {
    console.log(`\n  Готово: ${OUT}\n`);
    return;
  }

  const archive = `${OUT}.zip`;
  await rm(archive, { force: true });

  const zipped = await new Promise((resolveDone) => {
    const child = spawn('zip', ['-rq', archive, OUT.split('/').pop()], {
      cwd: resolve(OUT, '..'),
      stdio: 'ignore',
    });
    child.on('error', () => resolveDone(false));
    child.on('close', (code) => resolveDone(code === 0));
  });

  console.log(
    zipped
      ? `\n  Готово: ${archive}\n`
      : `\n  Папка собрана: ${OUT}\n  Упакуйте её сами и пришлите архив.\n`,
  );
}

main().catch((error) => {
  console.error(`\n  ✗ ${error.message}\n`);
  process.exit(1);
});
