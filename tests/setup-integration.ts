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
