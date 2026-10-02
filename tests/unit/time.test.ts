import { describe, expect, it } from 'vitest';
import { fromZonedInput, toZonedInput } from '@/lib/time';

/**
 * Время мероприятия и поле ввода.
 *
 * Живой случай: организатор открывал настройки, нажимал
 * «Сохранить», ничего не меняя, — и все даты уезжали на два часа
 * вперёд. Каждый раз. Форма рисовала берлинское время, сервер читал
 * ту же строку как UTC.
 *
 * Главное здесь — круговой обход: показать и прочитать обратно
 * должно дать ровно то же значение. Иначе сохранение начинает
 * портить данные самим фактом сохранения.
 */

describe('время мероприятия', () => {
  it('показывает момент в поясе мероприятия', () => {
    // 18:00 UTC = 20:00 в Берлине летом.
    expect(toZonedInput('2026-09-05T18:00:00.000Z', 'Europe/Berlin')).toBe('2026-09-05T20:00');
    expect(toZonedInput('2026-09-05T18:00:00.000Z', 'UTC')).toBe('2026-09-05T18:00');
  });

  it('читает введённое как время пояса, а не как UTC', () => {
    expect(fromZonedInput('2026-09-05T20:00', 'Europe/Berlin')).toBe('2026-09-05T18:00:00.000Z');
    expect(fromZonedInput('2026-09-05T20:00', 'UTC')).toBe('2026-09-05T20:00:00.000Z');
  });

  it('зимой смещение другое — константу зашивать нельзя', () => {
    // В январе Берлин на UTC+1, в сентябре на UTC+2.
    expect(fromZonedInput('2026-01-15T20:00', 'Europe/Berlin')).toBe('2026-01-15T19:00:00.000Z');
    expect(fromZonedInput('2026-09-15T20:00', 'Europe/Berlin')).toBe('2026-09-15T18:00:00.000Z');
  });

  it('круговой обход ничего не сдвигает', () => {
    // Ровно то, что делает форма: показали — сохранили — показали.
    const zones = ['Europe/Berlin', 'UTC', 'America/New_York', 'Asia/Tbilisi'];
    const moments = [
      '2026-09-05T12:00:00.000Z',
      '2026-01-01T23:30:00.000Z',
      '2026-06-30T04:15:00.000Z',
    ];

    for (const timeZone of zones) {
      for (const moment of moments) {
        const shown = toZonedInput(moment, timeZone);
        const back = fromZonedInput(shown, timeZone);
        expect(back, `${timeZone} ${moment}`).toBe(moment);

        // И второй круг: именно повторное сохранение уводило дату.
        expect(toZonedInput(back!, timeZone), `${timeZone} ${moment} второй круг`).toBe(shown);
      }
    }
  });

  it('мусор в поле — это не дата', () => {
    expect(fromZonedInput('', 'Europe/Berlin')).toBeNull();
    expect(fromZonedInput('вчера', 'Europe/Berlin')).toBeNull();
    expect(fromZonedInput('2026-09-05', 'Europe/Berlin')).toBeNull();
  });
});
