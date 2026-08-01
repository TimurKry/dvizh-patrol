import { describe, expect, it } from 'vitest';
import { formatIssuesCsv, parseCsv, parseTaskImport, toTaskRow } from '@/lib/import/tasks';

/**
 * Импорт заданий.
 *
 * Ключевое правило, которое здесь проверяется: одна плохая строка
 * отменяет весь импорт. Половина заданий в базе — худший из
 * возможных исходов для организатора.
 */

const validTask = {
  number: 1,
  title: 'Повторите знак',
  description: 'Найдите знак и повторите изображённое действие.',
  points: 50,
  category: 'road_signs',
};

describe('разбор CSV', () => {
  it('читает простые строки', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('понимает кавычки и запятые внутри поля', () => {
    expect(parseCsv('a,b\n"привет, мир",2')).toEqual([
      ['a', 'b'],
      ['привет, мир', '2'],
    ]);
  });

  it('понимает удвоенные кавычки', () => {
    expect(parseCsv('a\n"он сказал ""да"""')).toEqual([['a'], ['он сказал "да"']]);
  });

  it('переносит строки внутри поля', () => {
    const rows = parseCsv('a,b\n"первая\nвторая",2');
    expect(rows[1]?.[0]).toBe('первая\nвторая');
  });

  it('срезает BOM из Excel', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });

  it('принимает точку с запятой как разделитель', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('пропускает пустые строки', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toHaveLength(2);
  });
});

describe('разбор JSON', () => {
  it('принимает корректный файл', () => {
    const result = parseTaskImport(JSON.stringify([validTask]), 'json');

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it('подставляет значения по умолчанию', () => {
    const result = parseTaskImport(JSON.stringify([validTask]), 'json');
    const item = result.items[0]!;

    expect(item.difficulty).toBe('medium');
    expect(item.validationMode).toBe('manual');
    expect(item.maxAttempts).toBe(2);
    expect(item.active).toBe(true);
    expect(item.requireLocation).toBe(false);
  });

  it('сообщает о неразобранном JSON', () => {
    const result = parseTaskImport('{это не json}', 'json');

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.field).toBe('файл');
  });

  it('требует массив, а не объект', () => {
    const result = parseTaskImport(JSON.stringify(validTask), 'json');
    expect(result.ok).toBe(false);
  });

  it('ловит неизвестную категорию', () => {
    const result = parseTaskImport(
      JSON.stringify([{ ...validTask, category: 'выдуманная' }]),
      'json',
    );

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === 'category')).toBe(true);
  });

  it('ловит отрицательные баллы', () => {
    const result = parseTaskImport(JSON.stringify([{ ...validTask, points: -10 }]), 'json');
    expect(result.ok).toBe(false);
  });

  it('требует критерии для автоматической проверки', () => {
    const result = parseTaskImport(
      JSON.stringify([{ ...validTask, validationMode: 'ai', criteria: [] }]),
      'json',
    );

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === 'criteria')).toBe(true);
  });

  it('требует координаты, если нужна геопозиция', () => {
    const result = parseTaskImport(
      JSON.stringify([{ ...validTask, requireLocation: true }]),
      'json',
    );

    expect(result.ok).toBe(false);
  });

  it('находит повторяющиеся номера и указывает обе строки', () => {
    const result = parseTaskImport(
      JSON.stringify([validTask, { ...validTask, title: 'Другое' }]),
      'json',
    );

    expect(result.ok).toBe(false);
    const issue = result.issues.find((i) => i.field === 'number');
    expect(issue?.message).toContain('уже использован в строке 1');
  });

  it('одна плохая запись отменяет весь файл', () => {
    const result = parseTaskImport(
      JSON.stringify([
        validTask,
        { ...validTask, number: 2, points: 'много' },
        { ...validTask, number: 3 },
      ]),
      'json',
    );

    // Хорошие записи разобраны, но ok = false, и импорт не пойдёт.
    expect(result.ok).toBe(false);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
  });
});

describe('разбор CSV с заданиями', () => {
  const csv = [
    'number,title,description,points,category,criteria,validationMode',
    '1,Знак,"Найдите знак и повторите действие.",50,road_signs,"Виден знак | Видно двоих",ai',
    '2,Памятник,"Повторите позу памятника.",60,monuments,"Виден памятник",ai',
  ].join('\n');

  it('читает файл целиком', () => {
    const result = parseTaskImport(csv, 'csv');

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('разбивает критерии по вертикальной черте', () => {
    const result = parseTaskImport(csv, 'csv');
    expect(result.items[0]?.criteria).toEqual(['Виден знак', 'Видно двоих']);
  });

  it('понимает русские заголовки', () => {
    const russian = [
      'номер,название,описание,баллы,категория',
      '1,Знак,"Найдите знак и повторите.",50,road_signs',
    ].join('\n');

    const result = parseTaskImport(russian, 'csv');
    expect(result.ok).toBe(true);
    expect(result.items[0]?.title).toBe('Знак');
  });

  it('сообщает про неизвестные колонки', () => {
    const weird = [
      'number,title,description,points,category,лишняя',
      '1,Знак,"Найдите знак и повторите.",50,road_signs,ой',
    ].join('\n');

    const result = parseTaskImport(weird, 'csv');
    expect(result.issues.some((i) => i.message.includes('Неизвестные колонки'))).toBe(true);
  });

  it('нумерует строки с учётом заголовка', () => {
    const broken = [
      'number,title,description,points,category',
      '1,Знак,"Найдите знак и повторите.",50,road_signs',
      '2,Плохое,"Слишком коротко.",-5,road_signs',
    ].join('\n');

    const result = parseTaskImport(broken, 'csv');
    // Вторая запись — третья строка файла.
    expect(result.issues[0]?.row).toBe(3);
  });

  it('на пустом файле не падает', () => {
    expect(parseTaskImport('', 'csv').ok).toBe(false);
  });
});

describe('отчёт об ошибках', () => {
  it('формирует CSV с экранированием', () => {
    const csv = formatIssuesCsv([
      { row: 3, taskNumber: 2, field: 'points', message: 'Ожидалось число, а не "много"' },
    ]);

    expect(csv.split('\n')[0]).toBe('строка,номер_задания,поле,ошибка');
    expect(csv).toContain('""много""');
  });
});

describe('верхняя граница мероприятия', () => {
  /**
   * ТЗ обещает 30–50 заданий. Тридцать проверены образцом в
   * data/, а полсотни — только здесь: на верхней границе легче
   * всего споткнуться о лимит, которого никто не закладывал.
   */
  const fifty = Array.from({ length: 50 }, (_, index) => ({
    ...validTask,
    number: index + 1,
    title: `Задание номер ${index + 1}`,
  }));

  it('принимает пятьдесят заданий одним файлом', () => {
    const result = parseTaskImport(JSON.stringify(fifty), 'json');

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(50);
    expect(result.items.at(-1)?.number).toBe(50);
  });

  it('порядок сортировки берётся из номера, а не из места в файле', () => {
    // Организатор дописывает задания в конец файла как придётся;
    // на экране они всё равно должны идти по номерам.
    const reversed = [...fifty].reverse();
    const result = parseTaskImport(JSON.stringify(reversed), 'json');

    expect(result.ok).toBe(true);
    for (const item of result.items) {
      expect(toTaskRow(item, 'event-1').sort_order).toBe(item.number);
    }
  });

  it('отменяет весь файл из-за одной плохой строки в конце', () => {
    const withBadTail = [...fifty.slice(0, 49), { ...validTask, number: 50, points: -1 }];
    const result = parseTaskImport(JSON.stringify(withBadTail), 'json');

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.taskNumber === 50)).toBe(true);
  });
});

describe('подготовка строки для базы', () => {
  it('переводит поля в snake_case', () => {
    const result = parseTaskImport(JSON.stringify([validTask]), 'json');
    const row = toTaskRow(result.items[0]!, 'event-1');

    expect(row.event_id).toBe('event-1');
    expect(row.short_description).toBeNull();
    expect(row.max_attempts).toBe(2);
    expect(row.sort_order).toBe(1);
  });

  it('обнуляет координаты, если геопозиция не нужна', () => {
    const result = parseTaskImport(
      JSON.stringify([{ ...validTask, latitude: 51.3, longitude: 12.37 }]),
      'json',
    );
    const row = toTaskRow(result.items[0]!, 'event-1');

    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
  });
});
