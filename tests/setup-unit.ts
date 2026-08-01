/**
 * Окружение модульных тестов.
 *
 * Значения фиктивные: модульные тесты не ходят ни в базу, ни во
 * внешние сервисы. Они нужны только для тех модулей, которые
 * читают конфигурацию при импорте.
 */

process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key-not-a-real-one';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key-not-a-real-one';
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long';
process.env.POLICY_VERSION ??= 'test';
