import { afterEach, describe, expect, it } from 'vitest';
import { appUrl } from '@/lib/env';

/**
 * Публичный адрес приложения.
 *
 * Проверяется здесь потому, что ошибка в нём не видна ни в одном
 * тесте интерфейса и ни в одной ручной проверке страницы: адрес
 * уходит только в `metadataBase`, то есть в превью ссылки в
 * мессенджере. Разослали ссылку — картинки нет, и узнаёшь об этом
 * от участников.
 *
 * `tests/setup-unit.ts` ставит `NEXT_PUBLIC_APP_URL` в
 * `http://localhost:3000` — то же значение, что и запасное. Это и
 * есть состояние «своя переменная не задана».
 */

const VERCEL_KEYS = ['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const;

afterEach(() => {
  for (const key of VERCEL_KEYS) delete process.env[key];
});

describe('публичный адрес', () => {
  it('без переменных остаётся локальным', () => {
    expect(appUrl()).toBe('http://localhost:3000');
  });

  it('подставляет домен production на Vercel', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'dvizh-patrol.vercel.app';
    expect(appUrl()).toBe('https://dvizh-patrol.vercel.app');
  });

  it('домен production сильнее адреса конкретной выкладки', () => {
    // `VERCEL_URL` — адрес именно этой сборки, вида
    // `dvizh-patrol-abc123.vercel.app`. Превью ссылки, собранное
    // по нему, протухнет со следующей выкладкой.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'dvizh-patrol.vercel.app';
    process.env.VERCEL_URL = 'dvizh-patrol-azic9lfga.vercel.app';
    expect(appUrl()).toBe('https://dvizh-patrol.vercel.app');
  });

  it('обходится адресом выкладки, если домена production нет', () => {
    process.env.VERCEL_URL = 'dvizh-patrol-azic9lfga.vercel.app';
    expect(appUrl()).toBe('https://dvizh-patrol-azic9lfga.vercel.app');
  });

  it('не принимает пустую переменную за адрес', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = '   ';
    expect(appUrl()).toBe('http://localhost:3000');
  });

  it('снимает хвостовой слэш', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'dvizh-patrol.vercel.app/';
    expect(appUrl()).toBe('https://dvizh-patrol.vercel.app');
  });

  it('годится как основание для URL', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'dvizh-patrol.vercel.app';
    expect(new URL('/opengraph-image', appUrl()).toString()).toBe(
      'https://dvizh-patrol.vercel.app/opengraph-image',
    );
  });
});
