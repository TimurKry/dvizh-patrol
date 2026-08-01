import { defineConfig, devices } from '@playwright/test';

/**
 * Сквозные тесты.
 *
 * Требуют настоящего Supabase: приложение целиком построено
 * вокруг базы, Storage и сессий, и подменять их заглушками
 * означало бы проверять не то приложение, которое поедет в прод.
 *
 * Перед запуском:
 *   1. заполните .env.local (см. .env.example);
 *   2. примените миграции из supabase/migrations;
 *   3. создайте администратора: node scripts/create-admin.mjs;
 *   4. задайте E2E_ADMIN_EMAIL и E2E_ADMIN_PASSWORD;
 *   5. npm run test:e2e
 *
 * Тесты меняют состояние мероприятия, поэтому направляйте их на
 * тестовый проект Supabase, а не на боевой.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Europe/Berlin',
    // Геолокация нужна заданиям с привязкой к месту.
    permissions: ['geolocation'],
    geolocation: { latitude: 51.3397, longitude: 12.3731 },
  },

  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
