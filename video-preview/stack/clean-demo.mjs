/**
 * Уборка после записи.
 *
 * Стенд целиком временный: своя база на 127.0.0.1:54329, свои
 * файлы в scratch/storage. Скрипт стирает демо-данные и
 * останавливает процессы, чтобы после съёмки в системе не осталось
 * ни висящего Postgres, ни чужого приложения на 3000-м порту.
 *
 * Боевой базы это не касается никак: подключение зашито на
 * localhost и в другое место смотреть не умеет.
 */

import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '../..');
const DB_URL =
  process.env.DEMO_DATABASE_URL ??
  'postgresql://dvizh:dvizh_local_password@127.0.0.1:54329/dvizh_patrol';

if (!/127\.0\.0\.1|localhost/.test(DB_URL)) {
  process.stderr.write('clean-demo: адрес базы не локальный — отказываюсь\n');
  process.exit(1);
}

// ─── Демо-данные ─────────────────────────────────────────────
try {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query(`DELETE FROM team_hand`);
  await client.query(
    `UPDATE tasks SET claimed_by_team_id = NULL, claimed_submission_id = NULL, claimed_at = NULL`,
  );
  await client.query(`DELETE FROM score_transactions`);
  await client.query(`DELETE FROM submissions`);
  await client.query(`DELETE FROM team_sessions`);
  await client.query(`DELETE FROM consents`);
  await client.query(`DELETE FROM team_members`);
  await client.query(`DELETE FROM teams`);
  await client.query(`DELETE FROM admin_audit_log`);
  await client.end();
  process.stdout.write('  · демо-команды и отправки удалены\n');
} catch (error) {
  process.stdout.write(`  · база уже не отвечает (${error.code ?? 'нет соединения'})\n`);
}

// ─── Загруженные файлы ───────────────────────────────────────
await rm(path.join(ROOT, 'video-preview/scratch/storage'), { recursive: true, force: true });
process.stdout.write('  · файлы стенда удалены\n');

// ─── Процессы ────────────────────────────────────────────────
for (const [label, args] of [
  ['приложение', ['-f', 'next-server']],
  ['PostgREST', ['-f', 'postgrest']],
  ['браузер', ['-x', 'chrome']],
  ['Xvfb', ['-x', 'Xvfb']],
]) {
  await run('pkill', args).then(
    () => process.stdout.write(`  · ${label} остановлен\n`),
    () => process.stdout.write(`  · ${label} не запущен\n`),
  );
}

await run('bash', [path.join(ROOT, 'scripts/local-db.sh'), 'stop'], {
  env: { ...process.env, PG_BIN: process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin' },
}).then(
  () => process.stdout.write('  · Postgres остановлен\n'),
  () => process.stdout.write('  · Postgres не запущен\n'),
);

process.stdout.write('Стенд убран.\n');
