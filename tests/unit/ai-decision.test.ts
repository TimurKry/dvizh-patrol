import { describe, expect, it } from 'vitest';
import { decide } from '@/lib/ai/gemini';
import type { AiValidationResult } from '@/types/database';

/**
 * Решение по ответу модели.
 *
 * Единственное правило, которое не должно нарушаться ни при
 * каких обстоятельствах: автоматическая проверка может принять
 * или отдать человеку. Отклонить — никогда.
 */

function result(overrides: Partial<AiValidationResult> = {}): AiValidationResult {
  return {
    decision: 'accept',
    confidence: 0.95,
    checks: [],
    reason: 'Всё видно.',
    ...overrides,
  };
}

describe('порог уверенности', () => {
  it('принимает при уверенности выше порога', () => {
    expect(decide(result({ confidence: 0.95 }), 0.88)).toEqual({
      action: 'accept',
      confidence: 0.95,
    });
  });

  it('принимает ровно на пороге', () => {
    expect(decide(result({ confidence: 0.88 }), 0.88).action).toBe('accept');
  });

  it('отдаёт человеку чуть ниже порога', () => {
    const verdict = decide(result({ confidence: 0.87 }), 0.88);

    expect(verdict.action).toBe('manual_review');
    expect(verdict).toMatchObject({ reason: 'ai_low_confidence' });
  });

  it('учитывает порог мероприятия, а не зашитую константу', () => {
    // Организатор поднял планку до 0.99 — прежний ответ больше не проходит.
    expect(decide(result({ confidence: 0.95 }), 0.99).action).toBe('manual_review');
    // И наоборот: опустил до 0.5 — проходит и слабый ответ.
    expect(decide(result({ confidence: 0.6 }), 0.5).action).toBe('accept');
  });
});

describe('решение модели', () => {
  it('manual_review остаётся manual_review даже при высокой уверенности', () => {
    const verdict = decide(result({ decision: 'manual_review', confidence: 0.99 }), 0.88);
    expect(verdict.action).toBe('manual_review');
  });

  it('никогда не возвращает отклонение', () => {
    const cases: AiValidationResult[] = [
      result({ confidence: 0 }),
      result({ decision: 'manual_review', confidence: 0 }),
      result({ checks: [{ criterion: 'x', passed: false, confidence: 0.1, comment: '' }] }),
    ];

    for (const value of cases) {
      const verdict = decide(value, 0.88);
      expect(['accept', 'manual_review']).toContain(verdict.action);
    }
  });
});

describe('противоречия в ответе', () => {
  it('невыполненный критерий пересиливает вердикт accept', () => {
    const verdict = decide(
      result({
        decision: 'accept',
        confidence: 0.99,
        checks: [
          { criterion: 'Виден знак', passed: true, confidence: 0.99, comment: '' },
          { criterion: 'Видно двоих', passed: false, confidence: 0.9, comment: 'Один человек' },
        ],
      }),
      0.88,
    );

    expect(verdict.action).toBe('manual_review');
    expect(verdict).toMatchObject({ reason: 'criterion_failed' });
  });

  it('все критерии выполнены — принимает', () => {
    const verdict = decide(
      result({
        checks: [
          { criterion: 'Виден знак', passed: true, confidence: 0.95, comment: '' },
          { criterion: 'Видно двоих', passed: true, confidence: 0.93, comment: '' },
        ],
      }),
      0.88,
    );

    expect(verdict.action).toBe('accept');
  });
});

/**
 * Скрытые критерии в запросе к модели.
 *
 * Судье всё равно, какой критерий открытый, а какой скрытый: он
 * проверяет оба списка. Разница только в том, что скрытые не видит
 * команда — у загадки открытый критерий назвал бы ответ.
 */
describe('скрытые критерии в промпте', () => {
  it('уходят к модели вместе с открытыми', async () => {
    const { buildPromptForTests } = await import('@/lib/ai/gemini');

    const prompt = buildPromptForTests({
      title: 'Тот, кто вписал город в свою книгу',
      description: 'Найдите и снимите.',
      criteria: ['В кадре вся команда'],
      hiddenCriteria: ['В кадре памятник Фаусту'],
      minimumPeople: 0,
    });

    expect(prompt).toContain('В кадре вся команда');
    expect(prompt).toContain('В кадре памятник Фаусту');
  });

  it('без скрытых критериев промпт прежний', async () => {
    const { buildPromptForTests } = await import('@/lib/ai/gemini');

    const prompt = buildPromptForTests({
      title: 'Повторите знак',
      description: 'Найдите знак.',
      criteria: ['Виден треугольный знак'],
      minimumPeople: 2,
    });

    expect(prompt).toContain('Виден треугольный знак');
    expect(prompt).toContain('минимум 2');
  });
});
