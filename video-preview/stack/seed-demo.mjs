/**
 * Демо-данные для записи ролика.
 *
 * Что здесь настоящего:
 *   · схема и все серверные функции — из supabase/migrations;
 *   · пул заданий — data/tasks-leipzig-2026.json, тот самый файл,
 *     который импортирует админка перед мероприятием;
 *   · фотографии-эталоны — public/assets, снимки Лейпцига,
 *     которые уже стоят на боевом лендинге.
 *
 * Что придумано специально для записи:
 *   · шесть вымышленных команд и их результаты;
 *   · координаты и слоты витрины у нескольких заданий;
 *   · код demo-команды.
 *
 * Ни одной строки боевой базы этот скрипт не касается: он ходит
 * только в локальный Postgres на 127.0.0.1:54329.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { SERVICE_KEY } from './jwt.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DB_URL =
  process.env.DEMO_DATABASE_URL ??
  'postgresql://dvizh:dvizh_local_password@127.0.0.1:54329/dvizh_patrol';
const SHIM = process.env.SHIM_URL ?? 'http://127.0.0.1:54321';

export const DEMO_JOIN_CODE = 'DEMO26';
export const DEMO_TEAM_NAME = 'Движ-Демо';
/** Задание, которое команда выполняет в кадре. */
export const HERO_TASK_NUMBER = 22;

const client = new pg.Client({ connectionString: DB_URL });

// ═══ Раскладка демо-мероприятия ════════════════════════════════

/** Карта у заданий: организатор ставит её руками, в пуле её нет. */
const MAP_DATA = {
  // Гёте у Наschmarkt: контур квартала, точная точка не выдаётся.
  4: {
    mode: 'area',
    ring: [
      [12.3742, 51.34019],
      [12.37625, 51.34019],
      [12.37625, 51.33915],
      [12.3742, 51.33915],
      [12.3742, 51.34019],
    ],
  },
  // Вид с Augustusplatz — «место с открытки».
  22: { mode: 'point', latitude: 51.33858, longitude: 12.38143, radius: 150 },
  // Рыночная площадь — «Лейпциг одним кадром».
  41: { mode: 'point', latitude: 51.34035, longitude: 12.37519, radius: 120 },
  // Фонтан Мендебруннен.
  46: { mode: 'point', latitude: 51.33882, longitude: 12.38037, radius: 60 },
};

/** Эталоны: снимки Лейпцига из public/assets. */
const REFERENCES = [
  {
    number: 22,
    file: 'public/assets/polaroid-center.webp',
    caption: 'Так это выглядит на открытке',
    contentType: 'image/webp',
  },
  {
    number: 41,
    file: 'public/assets/polaroid-markt.webp',
    caption: 'Один кадр — весь центр',
    contentType: 'image/webp',
  },
];

/** Витрина лендинга: три задания, которые можно показывать всем. */
const LANDING_SLOTS = { 22: 1, 4: 2, 41: 3 };

/** Рука demo-команды: по две карточки каждого типа. */
const DEMO_HAND = [22, 4, 46, 47, 41, 1];

const TEAMS = [
  { name: 'Лейпцигские Лисы', code: 'LFX204', captain: 'Марта', accepted: [25, 32, 12, 6, 33] },
  { name: DEMO_TEAM_NAME, code: DEMO_JOIN_CODE, captain: 'Кирилл', accepted: [26, 9, 11, 3, 13] },
  { name: 'Тихий Патруль', code: 'TQP771', captain: 'Дана', accepted: [17, 20, 7, 10] },
  { name: 'Секунда До', code: 'SCD318', captain: 'Артём', accepted: [21, 5, 14] },
  { name: 'Гутен Морген', code: 'GMR540', captain: 'Влада', accepted: [27, 29] },
  { name: 'Полароид', code: 'PLR962', captain: 'Женя', accepted: [23, 31] },
];

const DEMO_MEMBERS = ['Кирилл', 'Настя', 'Тимур'];

/** Снимки для уже принятых заданий — городские кадры лендинга. */
const PAST_PHOTOS = [
  'public/assets/polaroid-markt.webp',
  'public/assets/polaroid-center.webp',
  'public/assets/polaroid-tunnel.webp',
  'public/assets/polaroid-station.webp',
];

// ═══ Работа ════════════════════════════════════════════════════

const sql = (text, params) => client.query(text, params);

async function uploadReference(bucket, key, file, contentType) {
  const body = await readFile(path.join(ROOT, file));
  const response = await fetch(`${SHIM}/storage/v1/object/${bucket}/${key}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${SERVICE_KEY}`, 'content-type': contentType },
    body,
  });
  if (!response.ok) throw new Error(`storage upload failed: ${response.status}`);
}

async function main() {
  await client.connect();

  const pool = JSON.parse(await readFile(path.join(ROOT, 'data/tasks-leipzig-2026.json'), 'utf8'));

  const { rows: eventRows } = await sql(`SELECT id FROM events WHERE slug = 'leipzig-2026'`);
  const eventId = eventRows[0].id;

  // ─── Мероприятие идёт ──────────────────────────────────────
  //
  // Боевое стоит в «finished»: квест отыгран. Записывать по нему
  // нельзя — участник увидел бы «мероприятие завершено». Поэтому
  // локальная копия переводится в «live».
  //
  // Дата остаётся настоящей — 5 сентября 2026, 14:00. Сдвигать её
  // «под сегодня» нельзя: лендинг показывает дату старта, и в
  // кадре она обязана совпасть с финальной плашкой ролика.
  // Срок окончания не задаётся вовсе: по схеме это «закрывает
  // только организатор», а таймер «до конца» иначе показывал бы
  // две недели.
  await sql(
    `UPDATE events SET
       status = 'live',
       registration_open = true,
       starts_at = timestamptz '2026-09-05 14:00:00+02',
       ends_at   = NULL,
       leaderboard_mode = 'public',
       team_size = 5,
       area_latitude = 51.3397,
       area_longitude = 12.3731,
       area_radius_meters = 1000,
       area_enforced = false,
       finish_title = 'Clara-Zetkin-Park, площадка у Sachsenbrücke',
       finish_address = 'Anton-Bruckner-Allee, 04107 Leipzig',
       finish_latitude = 51.32744,
       finish_longitude = 12.36373,
       finish_at = timestamptz '2026-09-05 18:30:00+02'
     WHERE id = $1`,
    [eventId],
  );

  // ─── Пул заданий ───────────────────────────────────────────
  await sql(`DELETE FROM team_hand`);
  // Снимаем захват до удаления отправок: FK обнуляет
  // claimed_submission_id и роняет tasks_claim_complete.
  await sql(
    `UPDATE tasks SET claimed_by_team_id = NULL, claimed_submission_id = NULL, claimed_at = NULL
       WHERE event_id = $1`,
    [eventId],
  );
  await sql(`DELETE FROM score_transactions WHERE event_id = $1`, [eventId]);
  await sql(`DELETE FROM submissions WHERE event_id = $1`, [eventId]);
  await sql(`DELETE FROM task_reference_images`);
  await sql(`DELETE FROM tasks WHERE event_id = $1`, [eventId]);

  for (const task of pool) {
    await sql(
      `INSERT INTO tasks (
         event_id, number, title, short_description, description, points,
         category, card_type, difficulty, validation_mode, criteria,
         minimum_people, max_attempts, require_location, active, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        eventId,
        task.number,
        task.title,
        task.shortDescription ?? null,
        task.description,
        task.points,
        task.category,
        task.cardType,
        task.difficulty,
        task.validationMode,
        JSON.stringify(task.criteria ?? []),
        task.minimumPeople ?? 0,
        task.maxAttempts ?? 2,
        task.requireLocation ?? false,
        task.active !== false,
        task.number,
      ],
    );
  }

  // ─── Карта у отдельных заданий ─────────────────────────────
  for (const [number, data] of Object.entries(MAP_DATA)) {
    if (data.mode === 'point') {
      await sql(
        `UPDATE tasks SET map_mode = 'point', latitude = $2, longitude = $3, radius_meters = $4
           WHERE event_id = $1 AND number = $5`,
        [eventId, data.latitude, data.longitude, data.radius, Number(number)],
      );
    } else {
      await sql(
        `UPDATE tasks SET map_mode = 'area', area_polygon = $2
           WHERE event_id = $1 AND number = $3`,
        [eventId, JSON.stringify({ type: 'Polygon', coordinates: [data.ring] }), Number(number)],
      );
    }
  }

  for (const [number, slot] of Object.entries(LANDING_SLOTS)) {
    await sql(`UPDATE tasks SET landing_slot = $2 WHERE event_id = $1 AND number = $3`, [
      eventId,
      slot,
      Number(number),
    ]);
  }

  // ─── Эталоны ───────────────────────────────────────────────
  for (const reference of REFERENCES) {
    const { rows } = await sql(`SELECT id FROM tasks WHERE event_id = $1 AND number = $2`, [
      eventId,
      reference.number,
    ]);
    if (rows.length === 0) continue;
    const taskId = rows[0].id;
    const imageId = crypto.randomUUID();
    const key = `events/${eventId}/tasks/${taskId}/${imageId}.webp`;

    await uploadReference('task-reference-images', key, reference.file, reference.contentType);
    await sql(
      `INSERT INTO task_reference_images (id, task_id, image_path, caption, sort_order, fit)
       VALUES ($1,$2,$3,$4,0,'cover')`,
      [imageId, taskId, key, reference.caption],
    );
    await sql(`UPDATE tasks SET image_caption = $2 WHERE id = $1`, [taskId, reference.caption]);
  }

  // ─── Команды ───────────────────────────────────────────────
  await sql(`DELETE FROM team_sessions`);
  await sql(`DELETE FROM consents`);
  await sql(`DELETE FROM team_members`);
  await sql(`DELETE FROM teams WHERE event_id = $1`, [eventId]);

  const teamIds = new Map();
  for (const team of TEAMS) {
    const { rows } = await sql(
      `INSERT INTO teams (event_id, name, join_code, captain_name, status, payment_confirmed)
       VALUES ($1,$2,$3,$4,'confirmed',true) RETURNING id`,
      [eventId, team.name, team.code, team.captain],
    );
    teamIds.set(team.name, rows[0].id);

    const members =
      team.name === DEMO_TEAM_NAME ? DEMO_MEMBERS : [team.captain, `${team.captain}-2`];
    for (const [index, name] of members.entries()) {
      await sql(
        `INSERT INTO team_members (team_id, name, is_captain) VALUES ($1,$2,$3)`,
        [rows[0].id, name, index === 0],
      );
    }
  }

  // ─── Уже принятые задания ──────────────────────────────────
  const totals = [];
  let minute = 90;
  let photoIndex = 0;

  for (const team of TEAMS) {
    const teamId = teamIds.get(team.name);
    let total = 0;

    for (const number of team.accepted) {
      const { rows } = await sql(`SELECT id, points FROM tasks WHERE event_id = $1 AND number = $2`, [
        eventId,
        number,
      ]);
      if (rows.length === 0) throw new Error(`нет задания №${number} в пуле`);
      const task = rows[0];
      minute -= 3;

      // Файл у принятой отправки обязателен по схеме. Кладём
      // городской снимок из public/assets — тот же, что стоит на
      // боевом лендинге.
      const submissionId = crypto.randomUUID();
      const imageKey = `events/${eventId}/teams/${teamId}/tasks/${task.id}/${submissionId}.webp`;
      const source = PAST_PHOTOS[photoIndex++ % PAST_PHOTOS.length];
      await uploadReference('submission-images', imageKey, source, 'image/webp');
      await uploadReference('submission-previews', imageKey, source, 'image/webp');

      const { rows: subRows } = await sql(
        `INSERT INTO submissions (
           id, event_id, team_id, task_id, status, attempt_number,
           submitted_at, awarded_points, reviewed_at, image_path, preview_path, mime_type
         ) VALUES ($6,$1,$2,$3,'accepted',1, now() - ($4 || ' minutes')::interval, $5,
                   now() - ($4 || ' minutes')::interval, $7, $7, 'image/webp')
         RETURNING id`,
        [eventId, teamId, task.id, String(minute), task.points, submissionId, imageKey],
      );

      await sql(
        `INSERT INTO score_transactions (event_id, team_id, submission_id, points, transaction_type, reason, created_at)
         VALUES ($1,$2,$3,$4,'task_accepted','Задание принято', now() - ($5 || ' minutes')::interval)`,
        [eventId, teamId, subRows[0].id, task.points, String(minute)],
      );

      await sql(
        `UPDATE tasks SET claimed_by_team_id = $2, claimed_submission_id = $3, claimed_at = now()
           WHERE id = $1`,
        [task.id, teamId, subRows[0].id],
      );

      total += task.points;
    }

    totals.push({ name: team.name, total });
  }

  // ─── Рука demo-команды ─────────────────────────────────────
  const demoTeamId = teamIds.get(DEMO_TEAM_NAME);
  for (const [index, number] of DEMO_HAND.entries()) {
    await sql(
      `INSERT INTO team_hand (team_id, task_id, dealt_at)
       SELECT $1, id, now() - ($3 || ' seconds')::interval
         FROM tasks WHERE event_id = $2 AND number = $4`,
      [demoTeamId, eventId, String(600 - index * 10), number],
    );
  }

  // ─── Администратор ─────────────────────────────────────────
  await sql(`DELETE FROM admin_users`);
  await sql(
    `INSERT INTO admin_users (user_id, email, name)
     VALUES ('00000000-0000-4000-8000-000000000001', 'demo-admin@dvizh-patrol.local', 'Демо-организатор')`,
  );
  await sql(`DELETE FROM admin_audit_log`);

  // ─── Отчёт ─────────────────────────────────────────────────
  const hero = pool.find((t) => t.number === HERO_TASK_NUMBER);
  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const demoIndex = sorted.findIndex((t) => t.name === DEMO_TEAM_NAME);
  const gap = sorted[0].total - sorted[demoIndex].total;

  process.stdout.write('\nРейтинг после посева:\n');
  sorted.forEach((t, i) => process.stdout.write(`  ${i + 1}. ${t.name} — ${t.total}\n`));
  process.stdout.write(`\nЗадание в кадре: №${hero.number} «${hero.title}», ${hero.points} баллов\n`);
  process.stdout.write(`Demo-команда на ${demoIndex + 1} месте, отставание ${gap}\n`);

  if (demoIndex !== 1) throw new Error('demo-команда должна стоять второй до отправки');
  if (gap >= hero.points) throw new Error('баллов задания не хватит, чтобы выйти в лидеры');

  process.stdout.write(`Код demo-команды: ${DEMO_JOIN_CODE}\n\n`);
  await client.end();
}

main().catch(async (error) => {
  process.stderr.write(`seed-demo: ${error.message}\n`);
  await client.end().catch(() => {});
  process.exit(1);
});
