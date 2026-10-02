-- ═══════════════════════════════════════════════════════════════
-- 0015 · Видимая зона картинки
--
-- Карточка задания — пропорция 4:3, а картинки приходят разные:
-- вертикальный рисунок, скан гравюры, кадр с телефона. До сих пор
-- любая из них обрезалась по центру, и у вертикального рисунка из
-- кадра уезжали головы — ровно то, ради чего его и загружали.
--
-- Два поля вместо обрезки файла.
--
-- `fit` — вписывать целиком или заполнять. Для рисунка и гравюры
-- «целиком» обычно правильнее: у них нет неважных краёв, и поля по
-- бокам честнее, чем срезанная половина. Для фотографии места
-- правильнее «заполнить»: там края как раз неважные.
--
-- `focus_x` / `focus_y` — куда смотреть, когда заполняем. Доля от
-- ширины и высоты, 0..1, по умолчанию центр. Организатор ставит
-- точку кликом по картинке.
--
-- Файл при этом не трогается. Обрезать оригинал значило бы терять
-- данные при каждой правке рамки и заводить пересжатие на сервере
-- ради того, что браузер делает двумя свойствами CSS.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.task_reference_images
  ADD COLUMN IF NOT EXISTS fit text NOT NULL DEFAULT 'cover';

ALTER TABLE public.task_reference_images
  DROP CONSTRAINT IF EXISTS task_reference_images_fit_valid;
ALTER TABLE public.task_reference_images
  ADD CONSTRAINT task_reference_images_fit_valid CHECK (fit IN ('cover', 'contain'));

ALTER TABLE public.task_reference_images
  ADD COLUMN IF NOT EXISTS focus_x numeric(4, 3) NOT NULL DEFAULT 0.5;

ALTER TABLE public.task_reference_images
  ADD COLUMN IF NOT EXISTS focus_y numeric(4, 3) NOT NULL DEFAULT 0.5;

ALTER TABLE public.task_reference_images
  DROP CONSTRAINT IF EXISTS task_reference_images_focus_range;
ALTER TABLE public.task_reference_images
  ADD CONSTRAINT task_reference_images_focus_range CHECK (
    focus_x BETWEEN 0 AND 1 AND focus_y BETWEEN 0 AND 1
  );

COMMENT ON COLUMN public.task_reference_images.fit IS
  'cover — заполнить кадр с обрезкой, contain — вписать целиком с полями.';
COMMENT ON COLUMN public.task_reference_images.focus_x IS
  'Точка фокуса по горизонтали, 0..1. Работает только при fit = cover.';
COMMENT ON COLUMN public.task_reference_images.focus_y IS
  'Точка фокуса по вертикали, 0..1. Работает только при fit = cover.';
