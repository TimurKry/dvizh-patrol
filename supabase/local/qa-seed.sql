-- ─────────────────────────────────────────────────────────────
-- ЛОКАЛЬНЫЕ ДАННЫЕ ДЛЯ ВИЗУАЛЬНОЙ ПРОВЕРКИ. НЕ ДЛЯ SUPABASE.
--
-- Накатывается поверх `npm run db:reset` и доводит базу до
-- состояния «квест идёт»: достаточно заданий каждого типа, чтобы
-- рука пополнялась, и команда с известным кодом QA1234.
--
-- Интеграционные тесты чистят таблицы целиком, поэтому после
-- каждого прогона `npm run test:integration` сид нужно накатить
-- заново — иначе страницы участника открывать не под кем.
-- ─────────────────────────────────────────────────────────────

-- Демонстрационных заданий в 0006 двенадцать, и они распределены
-- по типам неровно (3 / 3 / 6). Руке нужно минимум по два на тип
-- с запасом на захваты, поэтому добираем ровным набором.
INSERT INTO public.tasks (
  event_id, number, title, short_description, description, points,
  category, card_type, difficulty, validation_mode, criteria,
  max_attempts, active, sort_order
)
SELECT
  e.id,
  100 + g,
  'Демо-задание ' || g,
  'Короткое описание для карточки номер ' || g || '.',
  'Полное описание демонстрационного задания номер ' || g || '. '
    || 'Нужно для проверки вёрстки карточки на длинном тексте.',
  40 + g * 5,
  'object_search',
  (ARRAY['riddle', 'photo', 'active'])[1 + (g % 3)]::public.task_card_type,
  'medium',
  'manual',
  '["Виден объект целиком", "В кадре вся команда"]'::jsonb,
  2,
  true,
  100 + g
FROM public.events e
CROSS JOIN generate_series(1, 12) g
WHERE e.slug = 'leipzig-2026'
ON CONFLICT (event_id, number) DO NOTHING;

UPDATE public.events SET status = 'live' WHERE slug = 'leipzig-2026';

-- Команда с предсказуемым кодом. register_team отвечает за
-- капитана, согласия и сессию — повторять это руками нельзя,
-- иначе локальные данные разойдутся с продакшеном.
DO $$
DECLARE
  v_event uuid;
BEGIN
  SELECT id INTO v_event FROM public.events WHERE slug = 'leipzig-2026';

  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE join_code = 'QA1234') THEN
    PERFORM public.register_team(
      v_event, 'Ночной трамвай', 'Тимур', NULL,
      ARRAY['QA1234'], repeat('a', 64), 72, 'v1', false, 'qa-seed', true
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE join_code = 'QA5678') THEN
    PERFORM public.register_team(
      v_event, 'Второй патруль', 'Аня', NULL,
      ARRAY['QA5678'], repeat('b', 64), 72, 'v1', false, 'qa-seed', true
    );
  END IF;
END
$$;

-- Администратор для локального стенда. На Supabase строка
-- заводится скриптом scripts/create-admin.mjs после создания
-- аккаунта в Auth; здесь Auth заменяет фасад, поэтому нужен
-- только сам факт наличия строки.
INSERT INTO public.admin_users (user_id, email, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'admin@example.test', 'Локальный организатор')
ON CONFLICT (user_id) DO NOTHING;

-- ═══ Карта: граница поля и координаты заданий ════════════════
--
-- Без этого карта на локальном стенде пустая, и проверить
-- глазами крест фото-задания и район загадки нечем. Значения
-- вымышленные — центр Лейпцига в грубом четырёхугольнике.
UPDATE public.events
SET area_polygon = jsonb_build_object(
      'type', 'Polygon',
      'coordinates', jsonb_build_array(jsonb_build_array(
        jsonb_build_array(12.3560, 51.3480),
        jsonb_build_array(12.3900, 51.3480),
        jsonb_build_array(12.3900, 51.3310),
        jsonb_build_array(12.3560, 51.3310),
        jsonb_build_array(12.3560, 51.3480)
      ))
    )
WHERE slug = 'leipzig-2026';

-- Фото-заданиям — точные точки, загадкам — центр района с широким
-- радиусом. Активы координат не получают: они к месту не привязаны
-- и на карту не выходят по построению.
-- Раскладка по сетке, а не по одной формуле на оба типа: с общим
-- счётчиком загадка и фото с одинаковым порядковым номером
-- ложились в одну точку, и крест накрывал район.
WITH numbered AS (
  SELECT id, card_type,
         row_number() OVER (ORDER BY card_type, number) - 1 AS n
  FROM public.tasks
  WHERE card_type IN ('riddle', 'photo')
)
UPDATE public.tasks t
SET latitude       = 51.3345 + (numbered.n % 4) * 0.0032,
    longitude      = 12.3600 + (numbered.n / 4) * 0.0058,
    radius_meters  = CASE numbered.card_type WHEN 'riddle' THEN 260 ELSE 60 END,
    require_location = (numbered.card_type = 'photo')
FROM numbered
WHERE t.id = numbered.id;
