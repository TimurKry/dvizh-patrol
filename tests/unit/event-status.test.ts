import { describe, expect, it } from 'vitest';
import { EVENT_TRANSITIONS, allowedNextStatuses, dashboardTransitions } from '@/lib/event-status';
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
