import { describe, expect, it } from 'vitest';
import {
  EVENT_TRANSITIONS,
  allowedNextStatuses,
  dashboardTransitions,
  deadlinePassed,
  questOver,
  submissionsOpen,
} from '@/lib/event-status';
import { EVENT_STATUSES } from '@/types/database';
import type { EventStatus } from '@/types/database';

/**
 * Граф статусов мероприятия.
 *
 * Живой случай: квест обкатали до конца, статус остался
 * «Завершён», а собирать людей нужно было заново. Из «Завершён»
 * вели только «Возобновить» и «В архив» — дороги обратно к набору
 * не было вовсе, и открыть регистрацию стало нечем.
 *
 * Проверяется именно это свойство: тупиков, кроме архива, быть не
 * должно.
 */

/** Куда вообще можно попасть из статуса, за сколько угодно шагов. */
function reachable(from: EventStatus): Set<EventStatus> {
  const seen = new Set<EventStatus>();
  const queue: EventStatus[] = [from];

  while (queue.length) {
    for (const next of allowedNextStatuses(queue.shift()!)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

describe('переходы между статусами', () => {
  it('из любого статуса, кроме архива, можно вернуться к набору', () => {
    for (const status of EVENT_STATUSES) {
      if (status === 'archived' || status === 'registration') continue;
      expect(reachable(status), `тупик в статусе «${status}»`).toContain('registration');
    }
  });

  it('архив необратим — это единственный тупик', () => {
    expect(allowedNextStatuses('archived')).toEqual([]);
    for (const status of EVENT_STATUSES) {
      if (status === 'archived') continue;
      expect(allowedNextStatuses(status).length).toBeGreaterThan(0);
    }
  });

  it('в архив нельзя попасть случайно: только из завершённого и с вопросом', () => {
    for (const status of EVENT_STATUSES) {
      const toArchive = EVENT_TRANSITIONS[status].find((t) => t.status === 'archived');
      if (!toArchive) continue;
      expect(status).toBe('finished');
      expect(toArchive.confirm).toBeTruthy();
    }
  });

  it('шаг назад всегда объясняется, а шаг вперёд по игре — предупреждает', () => {
    // Кнопки, которые что-то закрывают у команд, обязаны спросить.
    const mustAsk: EventStatus[] = ['draft', 'live', 'paused', 'finished', 'archived'];
    for (const status of EVENT_STATUSES) {
      for (const transition of EVENT_TRANSITIONS[status]) {
        if (!mustAsk.includes(transition.status)) continue;
        // «Продолжить» из паузы ничего не отнимает.
        if (status === 'paused' && transition.status === 'live') continue;
        expect(transition.confirm, `${status} → ${transition.status} без вопроса`).toBeTruthy();
      }
    }
  });

  it('сводка показывает подмножество переходов, а не свой набор', () => {
    for (const status of EVENT_STATUSES) {
      const short = dashboardTransitions(status);
      expect(EVENT_TRANSITIONS[status]).toEqual(expect.arrayContaining(short));
      // Из тупика кнопок нет, из остальных — хотя бы одна: иначе
      // организатор упрётся в сводку, на которой нечего нажать.
      expect(short.length > 0).toBe(status !== 'archived');
    }
  });
});

/**
 * Часы игры.
 *
 * Квест заканчивается двумя способами — по времени и кнопкой, — и
 * первого раньше не существовало: колонка `ends_at` лежала в схеме
 * с самого начала и не использовалась нигде.
 */
describe('часы игры', () => {
  const at = (iso: string) => new Date(iso);
  const noon = at('2026-09-05T12:00:00Z');

  const live = (endsAt: string | null) => ({ status: 'live' as const, ends_at: endsAt });

  it('без времени конца отправки открыты сколько угодно', () => {
    expect(deadlinePassed(live(null), noon)).toBe(false);
    expect(submissionsOpen(live(null), noon)).toBe(true);
    expect(questOver(live(null), noon)).toBe(false);
  });

  it('до срока отправки открыты, после — закрыты', () => {
    const game = live('2026-09-05T18:00:00Z');
    expect(submissionsOpen(game, noon)).toBe(true);
    expect(submissionsOpen(game, at('2026-09-05T18:00:01Z'))).toBe(false);
    expect(questOver(game, at('2026-09-05T18:00:01Z'))).toBe(true);
  });

  it('на паузе отправки закрыты, но игра ещё не позади', () => {
    const paused = { status: 'paused' as const, ends_at: '2026-09-05T18:00:00Z' };
    expect(submissionsOpen(paused, noon)).toBe(false);
    expect(questOver(paused, noon)).toBe(false);
    // А вот после срока — позади, даже если пауза так и висит.
    expect(questOver(paused, at('2026-09-05T18:30:00Z'))).toBe(true);
  });

  it('до старта квест не «закончился», а ещё не начинался', () => {
    for (const status of ['draft', 'registration'] as const) {
      // Время конца в прошлом — остаток прошлого мероприятия.
      const event = { status, ends_at: '2020-01-01T00:00:00Z' };
      expect(questOver(event, noon), status).toBe(false);
      expect(submissionsOpen(event, noon), status).toBe(false);
    }
  });

  it('кнопка «Завершить» заканчивает игру и без срока', () => {
    expect(questOver({ status: 'finished', ends_at: null }, noon)).toBe(true);
    expect(questOver({ status: 'archived', ends_at: null }, noon)).toBe(true);
    expect(submissionsOpen({ status: 'finished', ends_at: null }, noon)).toBe(false);
  });
});
