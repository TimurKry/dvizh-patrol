import { describe, expect, it, vi } from 'vitest';

/**
 * Обработка картинок — необязательная часть приёма фотографии.
 *
 * Живой случай, найденный за две недели до мероприятия: на боевом
 * Vercel рядом с `sharp` не оказалось собранной libvips, и
 * `/api/submissions/confirm` отвечал пятисоткой. Снимок к этому
 * моменту уже лежал в хранилище, а команда видела «фото загружено,
 * но подтверждение не дошло». То есть отправить фотографию не мог
 * никто — из-за миниатюры и поиска дублей.
 *
 * Отсюда правило, которое здесь и закрепляется: без обработки
 * картинок отправка обязана проходить. Хуже — да: не будет ни
 * превью, ни защиты от повторной сдачи одного кадра. Но это
 * несравнимо лучше, чем вечер, в котором нельзя сдать ни одного
 * задания.
 */

describe('картинки без sharp', () => {
  it('хэш не считается, но и не роняет приём', async () => {
    vi.resetModules();
    vi.doMock('@/lib/image/sharp', () => ({
      loadSharp: async () => null,
      sharpTried: () => true,
    }));

    const { computePerceptualHash } = await import('@/lib/image/phash');

    // Настоящий буфер: дело не в том, что картинка плохая.
    const result = await computePerceptualHash(Buffer.from('не важно, что внутри'));
    expect(result).toBeNull();

    vi.doUnmock('@/lib/image/sharp');
    vi.resetModules();
  });

  it('с рабочим sharp хэш считается как обычно', async () => {
    vi.resetModules();
    const sharp = (await import('sharp')).default;

    const image = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .png()
      .toBuffer();

    const { computePerceptualHash } = await import('@/lib/image/phash');
    const hash = await computePerceptualHash(image);

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('модуль подгружается один раз, а не на каждую фотографию', async () => {
    vi.resetModules();
    const { loadSharp } = await import('@/lib/image/sharp');

    const first = await loadSharp();
    const second = await loadSharp();

    // Один и тот же объект: вечером через это место проходят сотни
    // снимков, и повторный разбор нативного модуля был бы заметен.
    expect(second).toBe(first);
  });
});
