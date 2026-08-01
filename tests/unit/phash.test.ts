import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  DUPLICATE_DISTANCE_THRESHOLD,
  computePerceptualHash,
  findDuplicate,
  hammingDistance,
  similarity,
} from '@/lib/image/phash';

/**
 * Перцептивный хэш.
 *
 * Главное свойство, ради которого он и нужен: пережатие и смена
 * размера почти не меняют хэш, а другая картинка меняет его сильно.
 */

/** Синтетическая картинка с узнаваемой структурой. */
async function makeImage(seed: number, size = 480): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(size * size * channels);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * channels;
      // Крупные плавные градиенты плюс зависящие от seed полосы:
      // получается структура, которую DCT видит по-разному.
      const value =
        128 +
        90 * Math.sin((x / size) * Math.PI * (1 + seed)) +
        60 * Math.cos((y / size) * Math.PI * (2 + seed * 0.5));
      const clamped = Math.max(0, Math.min(255, value));
      raw[i] = clamped;
      raw[i + 1] = Math.max(0, Math.min(255, clamped * 0.8));
      raw[i + 2] = Math.max(0, Math.min(255, 255 - clamped));
    }
  }

  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}

describe('расстояние Хэмминга', () => {
  it('одинаковые хэши дают ноль', () => {
    expect(hammingDistance('abcdef0123456789', 'abcdef0123456789')).toBe(0);
  });

  it('считает различающиеся биты', () => {
    // 0x0 = 0000, 0xf = 1111 — четыре бита разницы.
    expect(hammingDistance('0000000000000000', 'f000000000000000')).toBe(4);
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('хэши разной длины считает максимально далёкими', () => {
    expect(hammingDistance('abc', 'abcdef0123456789')).toBe(64);
  });

  it('похожесть обратна расстоянию', () => {
    expect(similarity('0000000000000000', '0000000000000000')).toBe(1);
    expect(similarity('0000000000000000', 'ffffffffffffffff')).toBe(0);
  });
});

describe('вычисление хэша', () => {
  it('возвращает 16 шестнадцатеричных символов', async () => {
    const hash = await computePerceptualHash(await makeImage(1));
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('не падает на мусоре вместо изображения', async () => {
    expect(await computePerceptualHash(Buffer.from('это не картинка'))).toBeNull();
  });

  it('переживает пережатие и уменьшение', async () => {
    const original = await makeImage(3);

    // То, что делает браузер перед отправкой: ресайз и WebP.
    const recompressed = await sharp(original)
      .resize(240)
      .webp({ quality: 60 })
      .toBuffer();

    const a = await computePerceptualHash(original);
    const b = await computePerceptualHash(recompressed);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(hammingDistance(a!, b!)).toBeLessThanOrEqual(DUPLICATE_DISTANCE_THRESHOLD);
  });

  it('различает разные изображения', async () => {
    const a = await computePerceptualHash(await makeImage(1));
    const b = await computePerceptualHash(await makeImage(7));

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(hammingDistance(a!, b!)).toBeGreaterThan(DUPLICATE_DISTANCE_THRESHOLD);
  });
});

describe('поиск дубликата', () => {
  const hash = '0f0f0f0f0f0f0f0f';

  it('находит точное совпадение', () => {
    const match = findDuplicate(hash, [
      { id: 'other', perceptual_hash: 'ffffffffffffffff' },
      { id: 'same', perceptual_hash: hash },
    ]);

    expect(match?.submissionId).toBe('same');
    expect(match?.distance).toBe(0);
    expect(match?.similarity).toBe(1);
  });

  it('выбирает самое близкое из нескольких', () => {
    const match = findDuplicate(hash, [
      { id: 'far', perceptual_hash: '0f0f0f0f0f0f0f0e' },
      { id: 'exact', perceptual_hash: hash },
    ]);

    expect(match?.submissionId).toBe('exact');
  });

  it('не считает дубликатом далёкое изображение', () => {
    expect(findDuplicate(hash, [{ id: 'x', perceptual_hash: 'ffffffffffffffff' }])).toBeNull();
  });

  it('на пустом списке возвращает null', () => {
    expect(findDuplicate(hash, [])).toBeNull();
  });
});
