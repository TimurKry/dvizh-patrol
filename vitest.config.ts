import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': root.replace(/\/$/, ''),
    },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@': root.replace(/\/$/, '') } },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup-unit.ts'],
        },
      },
      {
        resolve: { alias: { '@': root.replace(/\/$/, '') } },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup-integration.ts'],
          // Транзакции и advisory-локи проверяются на живой БД:
          // все файлы идут в одном процессе, иначе они мешают
          // друг другу состоянием общей схемы.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
