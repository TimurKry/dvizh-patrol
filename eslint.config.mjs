import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      // Подчёркивание — принятая в проекте пометка «значение
      // намеренно не используется»: неиспользуемый первый
      // аргумент серверных действий, отброшенные при
      // деструктуризации связи Supabase.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'e2e-results/**',
    'playwright-report/**',
    'public/sw.js',
  ]),
]);

export default eslintConfig;
