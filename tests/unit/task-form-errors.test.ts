import { describe, expect, it } from 'vitest';
import { taskSchema, taskValidationReport } from '@/lib/validation/schemas';
import { TASK_FIELD_LABELS } from '@/lib/messages';

/**
 * Отказ формы задания должен быть слышен.
 *
 * Живой случай: организатор завёл задание с нуля, не заполнив
 * «Полное описание», нажал «Создать задание» — и не увидел ничего.
 * Кнопка внизу формы, описание вверху, подпись об ошибке появилась
 * за пределами экрана. Задание в базу не попало, и со стороны это
 * читалось как поломка сохранения.
 *
 * Поэтому проверяется не только то, что схема отклоняет пустое
 * описание, но и то, что отказ приходит с текстом, называющим поле
 * так, как оно подписано в форме.
 */

const filled = {
  number: 53,
  title: 'Повторите мем',
  shortDescription: '',
  description: 'Найдите место с фотографии и повторите позу.',
  points: 130,
  category: 'monuments',
  cardType: 'photo',
  difficulty: 'medium',
  validationMode: 'manual',
  criteria: [],
  minimumPeople: 2,
  maxAttempts: 2,
  requireLocation: false,
  latitude: null,
  longitude: null,
  radiusMeters: null,
  active: true,
  mapMode: 'none',
  areaPolygon: null,
  imageCaption: '',
  landingSlot: 0,
  backstory: '',
  afterword: '',
  afterwordUrl: '',
  afterwordUrlLabel: '',
};

describe('отказ формы задания', () => {
  it('без описания задание не сохраняется', () => {
    expect(taskSchema.safeParse(filled).success).toBe(true);
    expect(taskSchema.safeParse({ ...filled, description: '' }).success).toBe(false);
  });

  it('называет незаполненное поле по-русски', () => {
    const parsed = taskSchema.safeParse({ ...filled, description: '' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const report = taskValidationReport(parsed.error);
    expect(report.fields.description).toBeTruthy();
    expect(report.message).toContain('Полное описание');
    // Никакой латиницы из схемы: организатор ищет поле по подписи,
    // которую видит в форме, а не по имени в коде.
    expect(report.message).not.toContain('description');
  });

  it('перечисляет все проблемные поля, а не первое', () => {
    const parsed = taskSchema.safeParse({ ...filled, description: '', title: 'ы' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const report = taskValidationReport(parsed.error);
    expect(report.message).toContain('Название');
    expect(report.message).toContain('Полное описание');
  });

  it('знает подпись для каждого поля, которое умеет отказать', () => {
    // Задание, в котором неверно всё сразу: так поднимаются разом
    // и проверки полей, и перекрёстные. Поле без подписи вылезло бы
    // в сообщении латиницей — и организатор искал бы в форме
    // «afterwordUrlLabel».
    const broken = {
      ...filled,
      number: 0,
      title: 'ы',
      shortDescription: 'я'.repeat(300),
      description: '',
      points: -5,
      category: 'нет такой',
      cardType: 'нет такого',
      difficulty: 'нет такой',
      validationMode: 'ai',
      criteria: [],
      minimumPeople: 99,
      maxAttempts: 0,
      requireLocation: true,
      latitude: 999,
      longitude: 999,
      radiusMeters: 1,
      mapMode: 'area',
      areaPolygon: { type: 'Polygon', coordinates: [] },
      imageCaption: 'я'.repeat(100),
      landingSlot: 9,
      backstory: 'я'.repeat(2100),
      afterword: 'я'.repeat(2100),
      afterwordUrl: 'ftp://example.org',
      afterwordUrlLabel: 'я'.repeat(100),
    };

    const parsed = taskSchema.safeParse(broken);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const keys = Object.keys(taskValidationReport(parsed.error).fields);
    // Проверка имеет смысл, только если полей набралось много.
    expect(keys.length).toBeGreaterThan(12);
    expect(keys.filter((key) => !(key in TASK_FIELD_LABELS))).toEqual([]);
  });
});
