import type { ImageFraming } from '@/types/database';

/**
 * Рамка картинки в стиль элемента.
 *
 * Кадр карточки — 4:3, а картинки приходят разные: вертикальный
 * рисунок, скан гравюры, кадр с телефона. `cover` заполняет кадр и
 * режет лишнее, `contain` вписывает целиком с полями.
 *
 * Точка фокуса работает только при `cover`: `object-position`
 * говорит браузеру, какую часть картинки оставить в кадре при
 * обрезке. Без неё браузер режет по центру, и у вертикального
 * рисунка из кадра уезжают головы — ровно то, ради чего его и
 * загружали.
 *
 * При `contain` позиция не задаётся: обрезки нет, двигать нечего.
 *
 * Функция общая для карточки, страницы задания и админки. Три
 * копии одной арифметики разошлись бы, и организатор увидел бы в
 * превью не то, что получит команда.
 */
export function framingStyle(framing?: ImageFraming | null): React.CSSProperties {
  const fit = framing?.fit ?? 'cover';

  if (fit === 'contain') {
    return { objectFit: 'contain' };
  }

  const x = clamp(framing?.focusX ?? 0.5);
  const y = clamp(framing?.focusY ?? 0.5);

  return {
    objectFit: 'cover',
    objectPosition: `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`,
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
