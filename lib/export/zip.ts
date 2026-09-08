/**
 * Сборка ZIP без зависимостей и без сжатия.
 *
 * Два решения, оба нарочные.
 *
 * **Без сжатия.** В архив едут JPEG и WebP — они уже сжаты, и
 * deflate отыграет на них проценты, потратив секунды процессорного
 * времени на каждый файл. Метод `stored` пишет байты как есть:
 * архив получается тем же по весу, но собирается мгновенно и
 * одинаково быстро на любом железе, включая телефон.
 *
 * **Без библиотеки.** Формат stored-архива — это заголовок, байты,
 * и оглавление в конце. Полторы сотни строк против зависимости,
 * которую пришлось бы держать в актуальном состоянии ради одной
 * кнопки.
 *
 * Модуль намеренно не знает ни про Node, ни про браузер: на входе
 * `Uint8Array`, на выходе `Uint8Array`. Поэтому он одинаково
 * работает на сервере, в браузере организатора и в тестах.
 *
 * Ограничение: ZIP64 не поддерживается. Пока архив и каждый файл в
 * нём меньше четырёх гигабайт, этого достаточно; на большем размере
 * `buildZip` бросит исключение, а не отдаст битый файл.
 */

const LIMIT = 0xffffffff;

// ═══ CRC32 ═════════════════════════════════════════════════════

/**
 * Таблица считается один раз при первом обращении.
 *
 * Не на старте модуля: на сервере он импортируется в каждый
 * запрос, а таблица нужна только тем, кто действительно собирает
 * архив.
 */
let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;

  const next = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    next[i] = value >>> 0;
  }

  table = next;
  return next;
}

export function crc32(data: Uint8Array): number {
  const lookup = crcTable();
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i += 1) {
    crc = lookup[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

// ═══ Мелочи формата ════════════════════════════════════════════

/**
 * Имя внутри архива.
 *
 * Пишется в UTF-8 с поднятым флагом кодировки (бит 11). Без флага
 * распаковщики Windows читают имя в местной кодировке, и кириллица
 * превращается в мусор — ровно та поломка, из-за которой архивы
 * «не открываются нормально».
 */
function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name.replace(/\\/g, '/').replace(/^\/+/, ''));
}

/**
 * Дата и время в формате MS-DOS.
 *
 * Секунды в нём хранятся с точностью до двух, год отсчитывается от
 * 1980-го. Всё это неважно для содержимого, но распаковщики
 * показывают дату файла, и «01.01.1980» выглядит как ошибка.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class Writer {
  readonly parts: Uint8Array[] = [];
  private length = 0;

  push(chunk: Uint8Array): void {
    this.parts.push(chunk);
    this.length += chunk.length;
  }

  get offset(): number {
    return this.length;
  }
}

function header(fields: Array<[size: 2 | 4, value: number]>, signature: number): Uint8Array {
  const size = 4 + fields.reduce((sum, [width]) => sum + width, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);

  view.setUint32(0, signature, true);

  let at = 4;
  for (const [width, value] of fields) {
    if (width === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value, true);
    at += width;
  }

  return out;
}

// ═══ Сборка ════════════════════════════════════════════════════

export interface ZipEntry {
  /** Путь внутри архива; папки задаются слэшем. */
  name: string;
  data: Uint8Array;
  /** Дата файла в архиве. По умолчанию — момент сборки. */
  modified?: Date;
}

/**
 * Архив кусками, без склейки в один массив.
 *
 * Сто мегабайт фотографий, собранные в единый `Uint8Array`, стоят
 * ещё ста мегабайт памяти на копию. `Blob` принимает список кусков
 * и склеивает их сам, уже вне кучи JavaScript, — поэтому в браузере
 * нужен именно этот вид.
 */
export function buildZipParts(entries: ZipEntry[]): Uint8Array[] {
  const body = new Writer();
  const directory = new Writer();
  const now = new Date();

  for (const entry of entries) {
    const start = body.offset;

    // Проверка размера идёт до подсчёта CRC, а не после: считать
    // контрольную сумму файла, который всё равно не поместится, —
    // это минуты работы впустую на каждом гигабайте.
    if (entry.data.length > LIMIT || start > LIMIT) {
      throw new Error('Архив больше четырёх гигабайт: нужен ZIP64, а он здесь не реализован.');
    }

    const name = encodeName(entry.name);
    const { time, date } = dosDateTime(entry.modified ?? now);
    const crc = crc32(entry.data);

    // Локальный заголовок: версия 2.0, флаг UTF-8, метод stored.
    body.push(
      header(
        [
          [2, 20],
          [2, 0x0800],
          [2, 0],
          [2, time],
          [2, date],
          [4, crc],
          [4, entry.data.length],
          [4, entry.data.length],
          [2, name.length],
          [2, 0],
        ],
        0x04034b50,
      ),
    );
    body.push(name);
    body.push(entry.data);

    directory.push(
      header(
        [
          [2, 20],
          [2, 20],
          [2, 0x0800],
          [2, 0],
          [2, time],
          [2, date],
          [4, crc],
          [4, entry.data.length],
          [4, entry.data.length],
          [2, name.length],
          [2, 0],
          [2, 0],
          [2, 0],
          [2, 0],
          [4, 0],
          [4, start],
        ],
        0x02014b50,
      ),
    );
    directory.push(name);
  }

  const directoryLength = directory.offset;
  const bodyLength = body.offset;

  const end = header(
    [
      [2, 0],
      [2, 0],
      [2, entries.length],
      [2, entries.length],
      [4, directoryLength],
      [4, bodyLength],
      [2, 0],
    ],
    0x06054b50,
  );

  return [...body.parts, ...directory.parts, end];
}

/** Тот же архив одним массивом — для сервера и тестов. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const parts = buildZipParts(entries);
  const total = parts.reduce((sum, part) => sum + part.length, 0);

  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
}

/**
 * Имя файла, которое переживёт распаковку где угодно.
 *
 * Набор запрещённых символов взят виндовый, а не линуксовый:
 * архивы собирают в одном месте, а открывают в другом, и строже
 * здесь Windows. Двоеточие в «Ратуша: вид сбоку» на macOS пройдёт,
 * а на Windows файл просто не создастся.
 */
export function safeFileName(value: string, fallback = 'без названия'): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 80);

  return cleaned || fallback;
}
