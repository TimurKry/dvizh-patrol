import 'server-only';
import type Sharp from 'sharp';

/**
 * Обработка картинок — необязательная часть приёма фотографии.
 *
 * `sharp` — нативный модуль: рядом с ним лежит собранная libvips.
 * На боевом Vercel эта библиотека однажды не доехала до функции, и
 * `import sharp from 'sharp'` уронил весь маршрут подтверждения:
 * снимок уже лежал в хранилище, а команда видела «подтверждение не
 * дошло». То есть отправить фотографию не мог никто — из-за
 * миниатюры.
 *
 * Отсюда правило: превью и поиск дублей — приятные добавки, а
 * приём отправки обязан работать без них. Модуль подгружается на
 * ходу и ровно один раз; не получилось — возвращаем `null`, и
 * вызывающий код идёт дальше без картинки.
 *
 * Статический импорт для этого не годится: он падает при разборе
 * маршрута, до всякого `try`.
 */

type SharpModule = typeof Sharp;

let cached: SharpModule | null = null;
let attempted = false;

export async function loadSharp(): Promise<SharpModule | null> {
  if (attempted) return cached;
  attempted = true;

  try {
    const mod = (await import('sharp')) as unknown as { default?: SharpModule } & SharpModule;
    cached = mod.default ?? mod;
  } catch (error) {
    // Один раз в журнал, а не на каждую фотографию вечера.
    console.error('sharp недоступен, обработка картинок отключена:', error);
    cached = null;
  }

  return cached;
}

/** Работает ли обработка картинок. Для страницы состояния. */
export function sharpTried(): boolean {
  return attempted;
}
