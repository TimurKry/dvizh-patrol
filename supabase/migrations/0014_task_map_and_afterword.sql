-- ═══════════════════════════════════════════════════════════════
-- 0014 · Карта задания отдельно от типа, и жизнь после отправки
--
-- Три вещи, которых не хватало организатору.
--
-- **Карта перестаёт быть производной от типа карточки.** Раньше
-- «загадка» означала «круг на карте», а «фото» — «крест», и выбора
-- не было. На практике это не работает: у загадки круг либо
-- приходится делать таким мелким, что он выдаёт ответ, либо таким
-- крупным, что он бесполезен. Дом со слонами видно с двух улиц —
-- честная область для него не круг, а многоугольник по кварталу.
-- А иным загадкам карта не нужна вовсе.
--
-- Теперь режим карты — отдельное поле: ничего, точка или область.
-- Тип карточки продолжает решать состав руки, но перестаёт решать,
-- что нарисовано на карте.
--
-- **Картинка на карточке — не обязательно фото-эталон.** Для
-- загадки эталона быть не может (он выдаст ответ), а вот старая
-- гравюра или картина по теме уместна. Плашка над картинкой
-- перестаёт всегда говорить «Фото-эталон» и берёт текст из
-- image_caption.
--
-- **После отправки задание не должно заканчиваться.** Команда
-- добежала, сняла, отправила — и в этот момент ей интересно
-- узнать, что это было за место. Отсюда afterword и ссылка на
-- статью: они показываются только после отправки, поэтому
-- подсказкой служить не могут.
-- ═══════════════════════════════════════════════════════════════

-- ─── Режим карты ───────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS map_mode text NOT NULL DEFAULT 'none';

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_map_mode_valid;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_map_mode_valid CHECK (map_mode IN ('none', 'point', 'area'));

COMMENT ON COLUMN public.tasks.map_mode IS
  'Что рисовать на карте: none — ничего, point — крест по latitude/longitude, area — многоугольник area_polygon.';

-- ─── Область задания ───────────────────────────────────────────
--
-- Формат тот же, что у границы поля, и проверяется той же
-- функцией из 0010. Второй формат для того же самого понятия
-- означал бы две валидации, две отрисовки и один баг.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS area_polygon jsonb;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_area_polygon_valid;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_area_polygon_valid CHECK (public.is_valid_area_polygon(area_polygon));

COMMENT ON COLUMN public.tasks.area_polygon IS
  'Область поиска как GeoJSON Polygon. Рисуется, когда map_mode = area.';

-- Режим обязан быть обеспечен данными: точка без координат и
-- область без полигона рисуют пустоту, и организатор узнаёт об
-- этом от команды посреди квеста.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_map_mode_has_data;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_map_mode_has_data CHECK (
    map_mode <> 'point' OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  );

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_map_area_has_polygon;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_map_area_has_polygon CHECK (
    map_mode <> 'area' OR area_polygon IS NOT NULL
  );

-- ─── Картинка и материал после отправки ────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS image_caption text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS afterword text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS afterword_url text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS afterword_url_label text;

COMMENT ON COLUMN public.tasks.image_caption IS
  'Плашка над картинкой: «Фото-эталон», «Картина», «Так это выглядело в 1900-м». NULL — плашки нет.';
COMMENT ON COLUMN public.tasks.afterword IS
  'Что рассказать команде после отправки. До отправки не показывается, поэтому подсказкой быть не может.';
COMMENT ON COLUMN public.tasks.afterword_url IS
  'Ссылка на статью, открывается вместе с afterword.';

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_afterword_url_shape;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_afterword_url_shape CHECK (
    afterword_url IS NULL OR afterword_url ~ '^https://'
  );

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_afterword_label_needs_url;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_afterword_label_needs_url CHECK (
    afterword_url_label IS NULL OR afterword_url IS NOT NULL
  );

-- ─── Бэкофилл ──────────────────────────────────────────────────
--
-- Существующие задания получают тот режим, который у них был по
-- факту: фото и загадка с координатами рисовали точку и круг,
-- актив не рисовал ничего. Круг загадки превращается в точку, а
-- не в область: полигона у неё пока нет, а рисовать его за
-- организатора значит выдумать границу.

UPDATE public.tasks
SET map_mode = CASE
  WHEN card_type = 'active' THEN 'none'
  WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 'point'
  ELSE 'none'
END
WHERE map_mode = 'none';

-- Плашка «Фото-эталон» до сих пор была вшита в разметку. Чтобы
-- надпись не пропала у заданий, где эталон действительно есть,
-- проставляем её тем, у кого он загружен.
UPDATE public.tasks t
SET image_caption = 'Фото-эталон'
WHERE image_caption IS NULL
  AND EXISTS (
    SELECT 1 FROM public.task_reference_images r WHERE r.task_id = t.id
  );
