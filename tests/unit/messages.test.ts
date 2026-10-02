import { describe, expect, it } from 'vitest';
import {
  ERROR_MESSAGES,
  SUBMISSION_STATUS_TEXT,
  attemptsWord,
  errorMessage,
  photosWord,
  plural,
  pointsWord,
  tasksWord,
  teamsWord,
} from '@/lib/messages';
import { SUBMISSION_STATUSES } from '@/types/database';

/**
 * Тексты для пользователя.
 *
 * Требование ТЗ: все сообщения на русском и без технических
 * подробностей. Заодно проверяем склонения — «5 задание» в
 * интерфейсе выглядит неряшливо.
 */

describe('склонения', () => {
  it('склоняет по правилам русского языка', () => {
    expect(plural(1, 'один', 'два', 'пять')).toBe('один');
    expect(plural(2, 'один', 'два', 'пять')).toBe('два');
    expect(plural(5, 'один', 'два', 'пять')).toBe('пять');
    expect(plural(0, 'один', 'два', 'пять')).toBe('пять');
  });

  it('правильно обрабатывает подростковые числа', () => {
    // 11–14 всегда идут по последней форме, несмотря на последнюю цифру.
    expect(plural(11, 'один', 'два', 'пять')).toBe('пять');
    expect(plural(12, 'один', 'два', 'пять')).toBe('пять');
    expect(plural(14, 'один', 'два', 'пять')).toBe('пять');
    expect(plural(21, 'один', 'два', 'пять')).toBe('один');
    expect(plural(22, 'один', 'два', 'пять')).toBe('два');
    expect(plural(111, 'один', 'два', 'пять')).toBe('пять');
  });

  it('работает с отрицательными числами', () => {
    // Штрафы приходят со знаком минус.
    expect(plural(-1, 'балл', 'балла', 'баллов')).toBe('балл');
    expect(plural(-5, 'балл', 'балла', 'баллов')).toBe('баллов');
  });

  it('даёт готовые формы для интерфейса', () => {
    expect(tasksWord(1)).toBe('задание');
    expect(tasksWord(3)).toBe('задания');
    expect(tasksWord(30)).toBe('заданий');

    expect(pointsWord(1)).toBe('балл');
    expect(pointsWord(50)).toBe('баллов');

    expect(teamsWord(10)).toBe('команд');
    expect(attemptsWord(2)).toBe('попытки');
    expect(photosWord(500)).toBe('фотографий');
  });
});

describe('сообщения об ошибках', () => {
  it('переводит известный код', () => {
    expect(errorMessage('event_full')).toBe(
      'Регистрация команд завершена — все доступные места заняты.',
    );
    expect(errorMessage('team_full')).toBe(
      'В этой команде уже находится максимальное количество участников.',
    );
  });

  it('на неизвестный код даёт нейтральный текст', () => {
    expect(errorMessage('какая_то_невиданная_ошибка')).toBe(ERROR_MESSAGES.unknown_error);
    expect(errorMessage(undefined)).toBe(ERROR_MESSAGES.unknown_error);
    expect(errorMessage(null)).toBe(ERROR_MESSAGES.unknown_error);
  });

  it('не показывает пользователю технические подробности', () => {
    // Сбой базы должен читаться как временная неполадка,
    // а не как стек ошибки.
    const message = errorMessage('database_error');
    expect(message).not.toMatch(/postgres|sql|supabase|error/i);
    expect(message).toContain('Попробуйте');
  });

  it('все сообщения на русском', () => {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      expect(message, `сообщение для ${code}`).toMatch(/[а-яё]/i);
    }
  });
});

describe('статусы отправок', () => {
  it('описан каждый статус из схемы', () => {
    for (const status of SUBMISSION_STATUSES) {
      const presentation = SUBMISSION_STATUS_TEXT[status];
      expect(presentation, `статус ${status}`).toBeDefined();
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.hint.length).toBeGreaterThan(0);
      // Значок обязателен: статус не должен различаться только цветом.
      expect(presentation.icon.length).toBeGreaterThan(0);
    }
  });

  it('после загрузки участнику предлагают идти дальше', () => {
    expect(SUBMISSION_STATUS_TEXT.pending.hint).toContain('Можно продолжать квест');
  });
});

describe('отказ от карточки', () => {
  it('объясняет каждый исход человеческими словами', () => {
    for (const code of ['task_not_on_hand', 'task_already_attempted', 'no_replacement']) {
      const message = errorMessage(code);
      expect(message, code).not.toBe(ERROR_MESSAGES.unknown_error);
      expect(message, code).toMatch(/[а-яё]/i);
    }
  });

  it('на отказе без замены говорит, что карточка осталась', () => {
    // Здесь легко написать «не получилось» и оставить человека
    // гадать, потерял он карту или нет.
    expect(errorMessage('no_replacement')).toContain('остаётся у вас');
  });
});
