import 'server-only';
import { loadSharp } from '@/lib/image/sharp';

/**
 * Перцептивный хэш (pHash) на дискретном косинусном преобразовании.
 *
 * Зачем: одну и ту же фотографию нельзя сдать в два задания или
 * переслать другой команде. Обычная хэш-сумма файла тут бесполезна —
 * достаточно пересжать снимок, и она изменится. pHash смотрит на
 * структуру изображения и переживает пережатие, смену размера,
 * небольшое изменение яркости.
 *
 * Схема стандартная: 32×32 в оттенках серого → DCT-II → берём
 * низкочастотный блок 8×8 без постоянной составляющей → сравниваем
 * с медианой → 64 бита.
 *
 * Совпадение хэшей НИКОГДА не отклоняет отправку само по себе:
 * она уходит на ручную проверку, решает человек.
 */

const SIZE = 32;
const HASH_SIDE = 8;

/** Ниже этого расстояния Хэмминга считаем фотографии похожими. */
export const DUPLICATE_DISTANCE_THRESHOLD = 8;

// Матрица коэффициентов DCT считается один раз: она одинакова
// для всех изображений, а перемножение 32×32 не бесплатное.
const COS_TABLE = (() => {
  const table = new Float64Array(SIZE * SIZE);
  for (let u = 0; u < SIZE; u += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      table[u * SIZE + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE));
    }
  }
  return table;
})();

const ALPHA = (() => {
  const a = new Float64Array(SIZE);
  a[0] = Math.SQRT1_2;
  for (let i = 1; i < SIZE; i += 1) a[i] = 1;
  return a;
})();

/** Двумерное DCT-II, разделённое на два одномерных прохода. */
function dct2d(pixels: Float64Array): Float64Array {
  const rows = new Float64Array(SIZE * SIZE);

  for (let y = 0; y < SIZE; y += 1) {
    for (let u = 0; u < SIZE; u += 1) {
      let sum = 0;
      for (let x = 0; x < SIZE; x += 1) {
        sum += pixels[y * SIZE + x]! * COS_TABLE[u * SIZE + x]!;
      }
      rows[y * SIZE + u] = sum * ALPHA[u]!;
    }
  }

  const out = new Float64Array(SIZE * SIZE);
  for (let u = 0; u < SIZE; u += 1) {
    for (let v = 0; v < SIZE; v += 1) {
      let sum = 0;
      for (let y = 0; y < SIZE; y += 1) {
        sum += rows[y * SIZE + u]! * COS_TABLE[v * SIZE + y]!;
      }
      out[v * SIZE + u] = sum * ALPHA[v]!;
    }
  }

  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Считает pHash изображения.
 *
 * Возвращает 16 шестнадцатеричных символов (64 бита) или null,
 * если файл не удалось разобрать — битая картинка не должна
 * ронять приём отправки.
 */
export async function computePerceptualHash(input: Buffer): Promise<string | null> {
  // Без обработки картинок дублей мы не ищем. Это хуже, чем с
  // ними, но несравнимо лучше, чем не принять фотографию вовсе.
  const sharp = await loadSharp();
  if (!sharp) return null;

  try {
    const raw = await sharp(input)
      // Поворот по EXIF нужен до того, как мы теряем метаданные,
      // иначе одна и та же фотография в портрете и ландшафте
      // даст разные хэши.
      .rotate()
      .greyscale()
      .resize(SIZE, SIZE, { fit: 'fill' })
      .raw()
      .toBuffer();

    if (raw.length < SIZE * SIZE) return null;

    const pixels = new Float64Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i += 1) pixels[i] = raw[i]!;

    const freq = dct2d(pixels);

    // Низкочастотный блок без DC-компоненты (0,0).
    const block: number[] = [];
    for (let v = 0; v < HASH_SIDE; v += 1) {
      for (let u = 0; u < HASH_SIDE; u += 1) {
        if (u === 0 && v === 0) continue;
        block.push(freq[v * SIZE + u]!);
      }
    }

    const threshold = median(block);

    let bits = '';
    let index = 0;
    for (let v = 0; v < HASH_SIDE; v += 1) {
      for (let u = 0; u < HASH_SIDE; u += 1) {
        if (u === 0 && v === 0) {
          // Место DC заполняем нулём, чтобы длина осталась 64 бита.
          bits += '0';
          continue;
        }
        bits += block[index]! > threshold ? '1' : '0';
        index += 1;
      }
    }

    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

/** Расстояние Хэмминга между двумя хэшами: 0 — идентичны, 64 — противоположны. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;

  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16);
    // Тетрада: считаем единичные биты.
    distance += ((diff >> 3) & 1) + ((diff >> 2) & 1) + ((diff >> 1) & 1) + (diff & 1);
  }
  return distance;
}

/** Похожесть от 0 до 1. Используется как duplicate_similarity. */
export function similarity(a: string, b: string): number {
  return 1 - hammingDistance(a, b) / 64;
}

export interface DuplicateCandidate {
  id: string;
  perceptual_hash: string;
}

export interface DuplicateMatch {
  submissionId: string;
  distance: number;
  similarity: number;
}

/**
 * Ищет самую похожую из ранее загруженных фотографий.
 *
 * Проверяется всё мероприятие целиком: и повторная отправка в
 * другое задание, и попытка сдать чужой снимок.
 */
export function findDuplicate(
  hash: string,
  candidates: DuplicateCandidate[],
  threshold: number = DUPLICATE_DISTANCE_THRESHOLD,
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;

  for (const candidate of candidates) {
    if (!candidate.perceptual_hash) continue;
    const distance = hammingDistance(hash, candidate.perceptual_hash);
    if (distance > threshold) continue;
    if (!best || distance < best.distance) {
      best = {
        submissionId: candidate.id,
        distance,
        similarity: 1 - distance / 64,
      };
    }
  }

  return best;
}
