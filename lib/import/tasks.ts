import { taskImportItemSchema, type TaskImportItem } from '@/lib/validation/schemas';
import { asAreaPolygon } from '@/lib/geo';

/**
 * Импорт заданий из JSON и CSV.
 *
 * Правило простое: либо импортируется весь файл, либо ничего.
 * Частичный импорт оставил бы организатора с половиной заданий
 * и без понимания, какие именно доехали.
 *
 * Разбор отделён от записи в базу, поэтому предпросмотр и
 * подтверждение работают на одном и том же коде.
 */

export interface ImportIssue {
  /** Номер строки в файле, начиная с 1. Для JSON — индекс + 1. */
  row: number;
  /** Номер задания, если его удалось прочитать. */
  taskNumber?: number;
  field: string;
  message: string;
}

export interface ImportResult {
  ok: boolean;
  items: TaskImportItem[];
  issues: ImportIssue[];
  /** Сколько строк было в файле до проверки. */
  total: number;
}

// ═══ CSV ═══════════════════════════════════════════════════════

/**
 * Разбор CSV по RFC 4180.
 *
 * Своя реализация вместо библиотеки: нужен ровно этот формат,
 * а поведение с кавычками и переводами строк внутри полей
 * важно контролировать самим — организаторы пишут описания
 * заданий в несколько абзацев.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  // BOM из Excel.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  while (index < text.length) {
    const char = text[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ',' || char === ';') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (char === '\r') {
      index += 1;
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Заголовки CSV. Совпадают с полями JSON. */
const CSV_ALIASES: Record<string, string> = {
  number: 'number',
  номер: 'number',
  title: 'title',
  название: 'title',
  shortdescription: 'shortDescription',
  short_description: 'shortDescription',
  краткое: 'shortDescription',
  description: 'description',
  описание: 'description',
  points: 'points',
  баллы: 'points',
  category: 'category',
  категория: 'category',
  cardtype: 'cardType',
  card_type: 'cardType',
  тип: 'cardType',
  типкарточки: 'cardType',
  difficulty: 'difficulty',
  сложность: 'difficulty',
  validationmode: 'validationMode',
  validation_mode: 'validationMode',
  проверка: 'validationMode',
  criteria: 'criteria',
  критерии: 'criteria',
  minimumpeople: 'minimumPeople',
  minimum_people: 'minimumPeople',
  минимумлюдей: 'minimumPeople',
  maxattempts: 'maxAttempts',
  max_attempts: 'maxAttempts',
  попытки: 'maxAttempts',
  requirelocation: 'requireLocation',
  require_location: 'requireLocation',
  latitude: 'latitude',
  longitude: 'longitude',
  radiusmeters: 'radiusMeters',
  radius_meters: 'radiusMeters',
  active: 'active',
  активно: 'active',
  mapmode: 'mapMode',
  map_mode: 'mapMode',
  карта: 'mapMode',
  areapolygon: 'areaPolygon',
  area_polygon: 'areaPolygon',
  область: 'areaPolygon',
  imagecaption: 'imageCaption',
  image_caption: 'imageCaption',
  подписькартинки: 'imageCaption',
  backstory: 'backstory',
  справка: 'backstory',
  landingslot: 'landingSlot',
  landing_slot: 'landingSlot',
  слотлендинга: 'landingSlot',
  afterword: 'afterword',
  послесловие: 'afterword',
  afterwordurl: 'afterwordUrl',
  afterword_url: 'afterwordUrl',
  ссылка: 'afterwordUrl',
  afterwordurllabel: 'afterwordUrlLabel',
  afterword_url_label: 'afterwordUrlLabel',
  подписьссылки: 'afterwordUrlLabel',
};

function normalizeHeader(header: string): string | null {
  const key = header.trim().toLowerCase().replace(/[\s-]/g, '');
  return CSV_ALIASES[key] ?? null;
}

function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'да', 'y'].includes(v);
}

/** Критерии в CSV разделяются символом | или переводом строки. */
function parseCriteria(value: string): string[] {
  return value
    .split(/[|\n]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function csvRowToObject(headers: Array<string | null>, cells: string[]): Record<string, unknown> {
  const raw: Record<string, string> = {};
  headers.forEach((header, i) => {
    if (header) raw[header] = cells[i] ?? '';
  });

  const out: Record<string, unknown> = {};

  if (raw.number !== undefined) out.number = Number(raw.number);
  if (raw.title !== undefined) out.title = raw.title;
  if (raw.shortDescription) out.shortDescription = raw.shortDescription;
  if (raw.description !== undefined) out.description = raw.description;
  if (raw.points !== undefined) out.points = Number(raw.points);
  if (raw.category !== undefined) out.category = raw.category.trim();
  if (raw.cardType) out.cardType = raw.cardType.trim();
  if (raw.difficulty) out.difficulty = raw.difficulty.trim();
  if (raw.validationMode) out.validationMode = raw.validationMode.trim();
  if (raw.criteria) out.criteria = parseCriteria(raw.criteria);
  if (raw.minimumPeople) out.minimumPeople = Number(raw.minimumPeople);
  if (raw.maxAttempts) out.maxAttempts = Number(raw.maxAttempts);
  if (raw.requireLocation) out.requireLocation = parseBoolean(raw.requireLocation);
  if (raw.latitude) out.latitude = Number(raw.latitude);
  if (raw.longitude) out.longitude = Number(raw.longitude);
  if (raw.radiusMeters) out.radiusMeters = Number(raw.radiusMeters);
  if (raw.active) out.active = parseBoolean(raw.active);
  if (raw.mapMode) out.mapMode = raw.mapMode.trim();
  if (raw.imageCaption) out.imageCaption = raw.imageCaption;
  if (raw.backstory) out.backstory = raw.backstory;
  if (raw.landingSlot) out.landingSlot = Number(raw.landingSlot);
  if (raw.afterword) out.afterword = raw.afterword;
  if (raw.afterwordUrl) out.afterwordUrl = raw.afterwordUrl.trim();
  if (raw.afterwordUrlLabel) out.afterwordUrlLabel = raw.afterwordUrlLabel;

  // Контур в CSV — та же строка JSON, что уходит из редактора
  // области. Рисовать полигон в таблице никто не станет, но
  // перенести уже нарисованный между мероприятиями — станет.
  if (raw.areaPolygon) {
    try {
      out.areaPolygon = JSON.parse(raw.areaPolygon);
    } catch {
      out.areaPolygon = raw.areaPolygon;
    }
  }

  return out;
}

/**
 * Режим карты для файлов, где его нет.
 *
 * Колонка появилась в 0014, а файлы организатора старше её. Без
 * этого каждое импортированное задание приезжало бы с пустой
 * картой, хотя координаты в файле есть. Правило то же, что в
 * бэкофилле миграции.
 */
function inferMapMode(item: Record<string, unknown>): void {
  if (item.mapMode !== undefined) return;
  const hasPoint = item.latitude != null && item.longitude != null;
  item.mapMode = item.cardType !== 'active' && hasPoint ? 'point' : 'none';
}

// ═══ Общий разбор ══════════════════════════════════════════════

export function parseTaskImport(content: string, format: 'json' | 'csv'): ImportResult {
  const issues: ImportIssue[] = [];
  let rawItems: Array<{ row: number; value: unknown }> = [];

  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return {
        ok: false,
        items: [],
        total: 0,
        issues: [
          {
            row: 0,
            field: 'файл',
            message: `Файл не является корректным JSON: ${String(error).slice(0, 120)}`,
          },
        ],
      };
    }

    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        items: [],
        total: 0,
        issues: [{ row: 0, field: 'файл', message: 'Ожидался массив заданий' }],
      };
    }

    rawItems = parsed.map((value, index) => ({ row: index + 1, value }));
  } else {
    const rows = parseCsv(content);
    if (rows.length < 2) {
      return {
        ok: false,
        items: [],
        total: 0,
        issues: [{ row: 0, field: 'файл', message: 'В файле нет строк с данными' }],
      };
    }

    const headers = rows[0]!.map(normalizeHeader);
    const unknownHeaders = rows[0]!.filter((h, i) => h.trim() && headers[i] === null);

    if (unknownHeaders.length > 0) {
      issues.push({
        row: 1,
        field: 'заголовок',
        message: `Неизвестные колонки: ${unknownHeaders.join(', ')}`,
      });
    }

    rawItems = rows
      .slice(1)
      .map((cells, index) => ({ row: index + 2, value: csvRowToObject(headers, cells) }));
  }

  const items: TaskImportItem[] = [];
  const seenNumbers = new Map<number, number>();

  for (const { row, value } of rawItems) {
    if (value && typeof value === 'object') inferMapMode(value as Record<string, unknown>);

    const parsed = taskImportItemSchema.safeParse(value);

    if (!parsed.success) {
      const number =
        value && typeof value === 'object' && 'number' in value
          ? Number((value as { number: unknown }).number)
          : undefined;

      for (const issue of parsed.error.issues) {
        issues.push({
          row,
          taskNumber: Number.isFinite(number) ? number : undefined,
          field: issue.path.join('.') || 'запись',
          message: issue.message,
        });
      }
      continue;
    }

    // Дублирующиеся номера ломают уникальный индекс в базе,
    // поэтому ловим их до вставки и показываем обе строки.
    const previousRow = seenNumbers.get(parsed.data.number);
    if (previousRow !== undefined) {
      issues.push({
        row,
        taskNumber: parsed.data.number,
        field: 'number',
        message: `Номер ${parsed.data.number} уже использован в строке ${previousRow}`,
      });
      continue;
    }

    seenNumbers.set(parsed.data.number, row);
    items.push(parsed.data);
  }

  return {
    ok: issues.length === 0 && items.length > 0,
    items,
    issues,
    total: rawItems.length,
  };
}

/** Отчёт об ошибках, который можно скачать и отправить автору файла. */
export function formatIssuesCsv(issues: ImportIssue[]): string {
  const header = 'строка,номер_задания,поле,ошибка';
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const lines = issues.map((issue) =>
    [issue.row, issue.taskNumber ?? '', escape(issue.field), escape(issue.message)].join(','),
  );

  return [header, ...lines].join('\n');
}

/** Из проверенной записи — строка для вставки в tasks. */
export function toTaskRow(item: TaskImportItem, eventId: string): Record<string, unknown> {
  return {
    event_id: eventId,
    number: item.number,
    title: item.title,
    short_description: item.shortDescription ?? null,
    description: item.description,
    points: item.points,
    category: item.category,
    card_type: item.cardType,
    difficulty: item.difficulty,
    validation_mode: item.validationMode,
    criteria: item.criteria,
    minimum_people: item.minimumPeople,
    max_attempts: item.maxAttempts,
    require_location: item.requireLocation,
    // Координаты сохраняются независимо от требования геопозиции.
    // Это разные вещи: крест на карте показывает, куда идти, а
    // require_location проверяет, что телефон действительно там.
    // Раньше они были связаны, и точка на карте существовала
    // только у заданий с включённой проверкой.
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    radius_meters: item.radiusMeters ?? null,
    map_mode: item.mapMode,
    area_polygon: asAreaPolygon(item.areaPolygon),
    image_caption: item.imageCaption || null,
    backstory: item.backstory || null,
    landing_slot: item.landingSlot || null,
    afterword: item.afterword || null,
    afterword_url: item.afterwordUrl || null,
    afterword_url_label: item.afterwordUrlLabel || null,
    active: item.active,
    sort_order: item.number,
  };
}
