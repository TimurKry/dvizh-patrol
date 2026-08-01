/**
 * Склейка классов. Без tailwind-merge: в системе один радиус,
 * одна палитра и мало вариантов, поэтому конфликтующие утилиты
 * почти не встречаются, а лишняя зависимость в мобильном бандле
 * заметнее, чем польза.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
