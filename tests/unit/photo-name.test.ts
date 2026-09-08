import { describe, expect, it } from 'vitest';
import { photoFileName, uniqueName } from '@/lib/export/photo-name';

/**
 * Имена снимков в архиве.
 *
 * Проверяются потому, что ошибка здесь беззвучна: архив соберётся,
 * скачается и откроется, просто через год по нему нельзя будет
 * понять, чей это кадр. А два одинаковых имени внутри одной папки
 * тихо теряют файл.
 */

const base = {
  team: 'Коржики',
  taskNumber: 59,
  taskTitle: 'Ратуша, которая старше',
  status: 'accepted' as const,
  attemptNumber: 1,
  imagePath: 'events/e/teams/t/tasks/k/abc.jpg',
};

describe('имя снимка', () => {
  it('складывается из команды, номера и названия', () => {
    expect(photoFileName(base)).toBe('Коржики/059 — Ратуша, которая старше.jpg');
  });

  it('дополняет номер нулями, чтобы файлы шли по порядку', () => {
    const names = [3, 17, 100].map((taskNumber) =>
      photoFileName({ ...base, taskNumber }),
    );

    // Сортировка по имени должна совпасть с порядком заданий —
    // ради этого нули и нужны.
    expect([...names].sort()).toEqual(names);
  });

  it('помечает незачтённое', () => {
    expect(photoFileName({ ...base, status: 'rejected' })).toContain('(не зачтено)');
    expect(photoFileName({ ...base, status: 'manual_review' })).toContain('(на ручной проверке)');
    expect(photoFileName({ ...base, status: 'uploading' })).toContain('(не долетело)');
  });

  it('зачтённое не помечает ничем', () => {
    expect(photoFileName(base)).not.toContain('(');
  });

  it('помечает повторную попытку', () => {
    expect(photoFileName({ ...base, attemptNumber: 2 })).toContain('(попытка 2)');
    expect(photoFileName({ ...base, status: 'rejected', attemptNumber: 3 })).toContain(
      '(не зачтено, попытка 3)',
    );
  });

  it('вычищает символы, запрещённые в Windows', () => {
    const name = photoFileName({ ...base, taskTitle: 'Мем: "что?" / <всё>' });
    expect(name).toBe('Коржики/059 — Мем что всё.jpg');
  });

  it('переживает пропавшие данные', () => {
    const name = photoFileName({
      team: null,
      taskNumber: null,
      taskTitle: null,
      status: 'accepted',
      attemptNumber: 1,
      imagePath: null,
    });

    expect(name).toBe('без команды/000 — задание.jpg');
  });

  it('берёт расширение из пути и не тащит мусор', () => {
    expect(photoFileName({ ...base, imagePath: 'a/b.png' })).toMatch(/\.png$/);
    expect(photoFileName({ ...base, imagePath: 'a/b.webp' })).toMatch(/\.webp$/);
    // Путь без точки и путь со странным хвостом дают безопасный jpg.
    expect(photoFileName({ ...base, imagePath: 'a/b' })).toMatch(/\.jpg$/);
    expect(photoFileName({ ...base, imagePath: 'a/b.jpeg?token=xyz' })).toMatch(/\.jpg$/);
  });
});

describe('тёзки', () => {
  it('первое имя оставляет как есть', () => {
    const taken = new Set<string>();
    expect(uniqueName('Коржики/059 — Ратуша.jpg', taken)).toBe('Коржики/059 — Ратуша.jpg');
  });

  it('второму и третьему добавляет номер перед расширением', () => {
    const taken = new Set<string>();
    const name = 'Коржики/059 — Ратуша.jpg';

    expect(uniqueName(name, taken)).toBe('Коржики/059 — Ратуша.jpg');
    expect(uniqueName(name, taken)).toBe('Коржики/059 — Ратуша (2).jpg');
    expect(uniqueName(name, taken)).toBe('Коржики/059 — Ратуша (3).jpg');
  });

  it('не путает одинаковые задания у разных команд', () => {
    const taken = new Set<string>();
    expect(uniqueName('Коржики/059 — Ратуша.jpg', taken)).toBe('Коржики/059 — Ратуша.jpg');
    expect(uniqueName('Зелёные/059 — Ратуша.jpg', taken)).toBe('Зелёные/059 — Ратуша.jpg');
  });

  it('ни одно имя не повторяется на длинном наборе', () => {
    const taken = new Set<string>();
    const names = Array.from({ length: 50 }, () => uniqueName('к/1 — одно и то же.jpg', taken));

    expect(new Set(names).size).toBe(50);
  });
});
