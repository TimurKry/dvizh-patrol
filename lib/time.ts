/**
 * Время мероприятия и поле ввода.
 *
 * Форма показывает и принимает время в поясе мероприятия, а база
 * хранит момент в UTC. Пока эти два преобразования жили в разных
 * местах — одно в компоненте формы, второго не было вовсе, — они
 * разошлись: страница рисовала берлинское время, сервер читал ту же
 * строку как UTC, и **каждое сохранение сдвигало все даты на два
 * часа**. Достаточно было трижды нажать «Сохранить», ничего не
 * трогая, чтобы старт уехал на шесть часов вперёд.
 *
 * Поэтому обе функции лежат рядом и обязаны быть обратными друг
 * другу — это и проверяется тестом.
 *
 * Пояс берётся у мероприятия, а не у браузера: организатор может
 * готовить квест из другого города, а участник — прилететь из
 * другого пояса и не переставить часы.
 */

/** Значение для `<input type="datetime-local">`: `2026-09-05T20:00`. */
export function toZonedInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Обратное преобразование: «20:00 в Берлине» — в момент времени.
 *
 * Смещение пояса вычисляется через сам пояс, а не берётся
 * константой: у Берлина оно летом и зимой разное, и мероприятие
 * 5 сентября попадает на летнее.
 *
 * Приём такой: сначала читаем строку как если бы она была в UTC,
 * потом смотрим, который час в нужном поясе в этот момент, и
 * разницу вычитаем. Двойное преобразование, зато без таблицы
 * часовых поясов и без зависимости.
 */
export function fromZonedInput(local: string, timeZone: string): string | null {
  // Значение поля: YYYY-MM-DDTHH:mm, иногда с секундами.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;

  const naive = Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
  if (Number.isNaN(naive)) return null;

  // Который час показывают в поясе в момент `naive`.
  const shown = Date.parse(`${toZonedInput(new Date(naive).toISOString(), timeZone)}:00Z`);
  const offset = shown - naive;

  return new Date(naive - offset).toISOString();
}
