/**
 * Подготовка фотографии в браузере.
 *
 * Работает до отправки на сервер и решает четыре задачи:
 *
 *  1. Разворачивает снимок по EXIF-ориентации. Телефон часто
 *     пишет «повернуть на 90°» в метаданные, и без этого шага
 *     фотография уезжает набок.
 *  2. Убирает метаданные. Перерисовка через canvas отбрасывает
 *     EXIF целиком, включая GPS-координаты съёмки и модель
 *     камеры — на сервер они не попадают вообще.
 *  3. Уменьшает длинную сторону до 1280–1600 px. Больше не нужно:
 *     проверка не станет точнее, а трафик на улице дорогой.
 *  4. Сжимает до разумного размера, но не настолько, чтобы
 *     проверка перестала различать детали.
 *
 * Модуль клиентский: работает только в браузере.
 */

export interface CompressOptions {
  /** Предельная длина большей стороны. */
  maxLongEdge: number;
  /** Верхняя граница размера файла в байтах. */
  maxBytes: number;
  /** Ниже этого качества не опускаемся, чтобы не потерять детали. */
  minQuality?: number;
}

export interface CompressedImage {
  blob: Blob;
  contentType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
  /** Во сколько раз файл стал меньше исходного. */
  ratio: number;
}

/** Поддерживает ли браузер кодирование в WebP. */
function supportsWebp(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Декодирование с учётом ориентации.
 *
 * createImageBitmap с imageOrientation: 'from-image' сам применяет
 * EXIF-поворот. Там, где его нет (старые Safari), откатываемся на
 * HTMLImageElement — современные браузеры и он разворачивает
 * корректно.
 */
async function decode(file: Blob): Promise<{
  draw: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        draw: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Падаем в запасной путь.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      img.src = url;
    });
    return {
      draw: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function compressImage(
  file: File | Blob,
  options: CompressOptions,
): Promise<CompressedImage> {
  const { maxLongEdge, maxBytes, minQuality = 0.55 } = options;
  const decoded = await decode(file);

  try {
    const longEdge = Math.max(decoded.width, decoded.height);
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    // Пропорции сохраняем: обрезка меняла бы содержание кадра.
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Браузер не поддерживает обработку изображений');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Белая подложка: прозрачный PNG иначе станет чёрным в JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.draw, 0, 0, width, height);

    const contentType: 'image/webp' | 'image/jpeg' = supportsWebp() ? 'image/webp' : 'image/jpeg';

    // Подбираем качество сверху вниз, пока не уложимся в лимит.
    let blob: Blob | null = null;
    for (const quality of [0.85, 0.78, 0.7, 0.62, minQuality]) {
      blob = await canvasToBlob(canvas, contentType, quality);
      if (blob && blob.size <= maxBytes) break;
    }

    if (!blob) throw new Error('Не удалось подготовить изображение');

    // Даже на минимальном качестве не влезли — уменьшаем размер.
    if (blob.size > maxBytes) {
      const shrink = Math.sqrt(maxBytes / blob.size);
      const w = Math.max(640, Math.round(width * shrink));
      const h = Math.max(1, Math.round((height * w) / width));
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(decoded.draw, 0, 0, w, h);
      blob = (await canvasToBlob(canvas, contentType, 0.7)) ?? blob;

      return {
        blob,
        contentType,
        width: w,
        height: h,
        bytes: blob.size,
        ratio: file.size > 0 ? file.size / blob.size : 1,
      };
    }

    return {
      blob,
      contentType,
      width,
      height,
      bytes: blob.size,
      ratio: file.size > 0 ? file.size / blob.size : 1,
    };
  } finally {
    decoded.release();
  }
}

/** «1,4 МБ» — размер для показа рядом с превью. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
}
