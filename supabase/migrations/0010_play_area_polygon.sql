-- ─────────────────────────────────────────────────────────────
-- 0010 — Игровое поле полигоном
--
-- Миграция 0007 хранила поле кругом: центр и радиус. Для «километра
-- вокруг Рыночной площади» этого хватало, но настоящая граница
-- центра Лейпцига идёт по улицам и кольцу, а не по окружности —
-- круг либо срезает нужные кварталы, либо захватывает лишние.
--
-- Полигон добавляется РЯДОМ с кругом, а не вместо него:
--
--   · круг остаётся запасным вариантом и продолжает работать
--     там, где поле действительно круглое;
--   · уже настроенные мероприятия не ломаются;
--   · откат сводится к очистке одной колонки.
--
-- PostGIS не подключается. Ради одной фигуры и проверки «точка
-- внутри многоугольника» расширение не нужно: алгоритм ray
-- casting — двадцать строк, и он не тянет за собой ни установку
-- расширения на Supabase, ни новый тип колонки.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS area_polygon jsonb;

COMMENT ON COLUMN public.events.area_polygon IS
  'Граница поля как GeoJSON Polygon. NULL — используется круг из area_latitude/area_radius_meters.';

/**
 * Проверка формы полигона.
 *
 * Валидация живёт в базе, а не только в серверном действии:
 * колонку заполняет ещё и импорт, и правка руками через SQL во
 * время мероприятия — а испорченная граница означает, что
 * отправки перестанут приниматься у всех сразу.
 *
 * Требования: GeoJSON Polygon, ровно одно кольцо, минимум четыре
 * точки (три угла плюс замыкающая), координаты в допустимых
 * пределах, кольцо замкнуто.
 */
CREATE OR REPLACE FUNCTION public.is_valid_area_polygon(p_polygon jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_ring  jsonb;
  v_point jsonb;
  v_lon   numeric;
  v_lat   numeric;
BEGIN
  IF p_polygon IS NULL THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(p_polygon) <> 'object' THEN RETURN false; END IF;
  IF p_polygon ->> 'type' <> 'Polygon' THEN RETURN false; END IF;
  IF jsonb_typeof(p_polygon -> 'coordinates') <> 'array' THEN RETURN false; END IF;

  -- Дырок в игровом поле не бывает: одно внешнее кольцо.
  IF jsonb_array_length(p_polygon -> 'coordinates') <> 1 THEN RETURN false; END IF;

  v_ring := p_polygon -> 'coordinates' -> 0;
  IF jsonb_typeof(v_ring) <> 'array' THEN RETURN false; END IF;

  -- Треугольник — минимальная фигура; четвёртая точка замыкающая.
  IF jsonb_array_length(v_ring) < 4 THEN RETURN false; END IF;
  -- Верхняя граница защищает от вставки трека на десять тысяч точек.
  IF jsonb_array_length(v_ring) > 500 THEN RETURN false; END IF;

  FOR v_point IN SELECT * FROM jsonb_array_elements(v_ring)
  LOOP
    IF jsonb_typeof(v_point) <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(v_point) <> 2 THEN RETURN false; END IF;
    IF jsonb_typeof(v_point -> 0) <> 'number' THEN RETURN false; END IF;
    IF jsonb_typeof(v_point -> 1) <> 'number' THEN RETURN false; END IF;

    v_lon := (v_point ->> 0)::numeric;
    v_lat := (v_point ->> 1)::numeric;

    IF v_lon < -180 OR v_lon > 180 THEN RETURN false; END IF;
    IF v_lat < -90 OR v_lat > 90 THEN RETURN false; END IF;
  END LOOP;

  -- Кольцо обязано быть замкнутым: GeoJSON этого требует, а
  -- незамкнутое кольцо ломает проверку «точка внутри».
  IF (v_ring -> 0) <> (v_ring -> (jsonb_array_length(v_ring) - 1)) THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_area_polygon_valid;
ALTER TABLE public.events
  ADD CONSTRAINT events_area_polygon_valid CHECK (public.is_valid_area_polygon(area_polygon));

-- Строгий режим требует хоть какой-то границы: раньше проверялся
-- только круг, теперь подходит и полигон.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_area_enforced_needs_area;
ALTER TABLE public.events
  ADD CONSTRAINT events_area_enforced_needs_area CHECK (
    area_enforced = false OR area_latitude IS NOT NULL OR area_polygon IS NOT NULL
  );

/**
 * Точка внутри полигона — ray casting.
 *
 * Луч пускается вправо от точки; пересечения со сторонами
 * считаются. Нечётное число — точка внутри.
 *
 * Координаты трактуются как плоские. На масштабе городского
 * центра это даёт ошибку в единицы метров — меньше, чем
 * погрешность телефона, ради которой в checkPlayArea и так
 * заложен допуск.
 */
CREATE OR REPLACE FUNCTION public.point_in_area_polygon(
  p_polygon   jsonb,
  p_latitude  double precision,
  p_longitude double precision
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_ring   jsonb;
  v_count  integer;
  v_inside boolean := false;
  i        integer;
  x1 double precision; y1 double precision;
  x2 double precision; y2 double precision;
BEGIN
  IF p_polygon IS NULL OR p_latitude IS NULL OR p_longitude IS NULL THEN
    RETURN NULL;
  END IF;

  v_ring := p_polygon -> 'coordinates' -> 0;
  v_count := jsonb_array_length(v_ring);

  FOR i IN 0 .. v_count - 2
  LOOP
    x1 := (v_ring -> i ->> 0)::double precision;
    y1 := (v_ring -> i ->> 1)::double precision;
    x2 := (v_ring -> (i + 1) ->> 0)::double precision;
    y2 := (v_ring -> (i + 1) ->> 1)::double precision;

    IF ((y1 > p_latitude) <> (y2 > p_latitude))
       AND (p_longitude < (x2 - x1) * (p_latitude - y1) / NULLIF(y2 - y1, 0) + x1)
    THEN
      v_inside := NOT v_inside;
    END IF;
  END LOOP;

  RETURN v_inside;
END
$$;

COMMENT ON FUNCTION public.point_in_area_polygon IS
  'Ray casting без PostGIS. NULL, если полигона или координат нет.';

GRANT EXECUTE ON FUNCTION public.is_valid_area_polygon(jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.point_in_area_polygon(jsonb, double precision, double precision)
  TO service_role, authenticated;
