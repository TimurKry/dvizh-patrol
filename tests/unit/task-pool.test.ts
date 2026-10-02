import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTaskImport } from '@/lib/import/tasks';
import { TASK_CARD_TYPES } from '@/types/database';

/**
 * Боевой пул заданий Лейпцига.
 *
 * Файл `data/tasks-leipzig-2026.json` заливается организатором
 * через `/admin/import`, и узнать о том, что он не проходит
 * схему, за час до старта — худший из возможных вариантов.
 * Тест гоняет по нему тот же самый разборщик, что и импорт.
 *
 * Второе, что он сторожит, — размер пула по типам.
 *
 * Считать нужно по захватам, а не по рукам. Одна карточка лежит
 * на руках у скольких угодно команд одновременно — в этом и есть
 * гонка: все видят одно задание, забирает первый. Из пула карточка
 * уходит только в момент принятия отправки. Значит пулу надо
 * пережить не раздачу, а все захваты за вечер.
 *
 * Шесть команд, до шести закрытых заданий на команду — тридцать
 * шесть захватов. Рука состоит из двух карточек каждого типа,
 * поэтому захваты распределяются по типам примерно поровну: по
 * двенадцать. Это и есть порог.
 */

const POOL_PATH = join(process.cwd(), 'data/tasks-leipzig-2026.json');
const EXPECTED_TEAMS = 6;
const TASKS_PER_TEAM = 6;
const CARD_TYPE_COUNT = TASK_CARD_TYPES.length;
const MIN_PER_TYPE = (EXPECTED_TEAMS * TASKS_PER_TEAM) / CARD_TYPE_COUNT;

const result = parseTaskImport(readFileSync(POOL_PATH, 'utf8'), 'json');

describe('пул заданий Лейпцига', () => {
  it('проходит тот же разбор, что и импорт в админке', () => {
    expect(result.issues, JSON.stringify(result.issues, null, 2)).toHaveLength(0);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('номера уникальны', () => {
    const numbers = result.items.map((item) => item.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('каждый тип переживает вечер на шести командах', () => {
    for (const type of TASK_CARD_TYPES) {
      const count = result.items.filter((item) => item.cardType === type).length;
      expect(count, `тип ${type}`).toBeGreaterThanOrEqual(MIN_PER_TYPE);
    }
  });

  /**
   * Критерии видны команде на странице задания — блок «Что должно
   * быть в кадре». Для загадки это значит, что критерий, называющий
   * искомый объект, выдаёт ответ ещё до выхода из дома. Поэтому у
   * загадок ручная проверка: режим `ai` требует критериев, а
   * безопасные для загадки критерии слишком общие, чтобы по ним
   * можно было что-то автоматически решить.
   */
  it('загадки проверяются вручную', () => {
    const wrong = result.items
      .filter((item) => item.cardType === 'riddle' && item.validationMode !== 'manual')
      .map((item) => item.number);
    expect(wrong).toEqual([]);
  });

  it('у заданий с автопроверкой есть критерии', () => {
    const wrong = result.items
      .filter((item) => item.validationMode === 'ai' && item.criteria.length === 0)
      .map((item) => item.number);
    expect(wrong).toEqual([]);
  });
});
