import { Client } from 'pg';

/**
 * Окружение интеграционных тестов.
 *
 * Тесты работают с настоящим PostgreSQL, поднятым скриптом
 * scripts/local-db.sh. Это не Supabase, но схема, функции,
 * ограничения и индексы — ровно те же, что уйдут в продакшен,
 * а именно они и проверяются.
 */

process.env.DATABASE_URL ??=
  'postgresql://dvizh:dvizh_local_password@127.0.0.1:54329/dvizh_patrol';
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long';

/**
 * Проверка подключения до запуска тестов.
 *
 * Без неё незапущенная база даёт несколько десятков одинаковых
 * падений, по которым непонятно, что именно не так. Одно внятное
 * сообщение экономит человеку четверть часа.
 */
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const { rows } = await client.query<{ tables: string }>(
    `SELECT count(*) AS tables FROM pg_tables WHERE schemaname = 'public'`,
  );

  if (Number(rows[0]?.tables ?? 0) === 0) {
    throw new Error(
      'База пуста — миграции не накатаны.\n\n' +
        '  npm run db:reset\n',
    );
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);

  throw new Error(
    '\n\nИнтеграционные тесты требуют локального PostgreSQL.\n\n' +
      `  Причина: ${reason}\n\n` +
      '  Поднять базу и накатить миграции:\n' +
      '    npm run db:start\n' +
      '    npm run db:reset\n\n' +
      `  Строка подключения: ${process.env.DATABASE_URL}\n`,
  );
} finally {
  await client.end().catch(() => undefined);
}
