import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Пакет server-only бросает исключение вне сборки Next.js.
 * В тестах модули и так исполняются в Node, поэтому подменяем
 * его пустышкой — сам запрет остаётся в силе при сборке.
 */
const alias = {
  '@': root.replace(/\/$/, ''),
  'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup-unit.ts'],
        },
      },
      {
        resolve: { alias },
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
