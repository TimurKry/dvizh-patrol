-- ─────────────────────────────────────────────────────────────
-- 0007 — Игровое поле
--
-- Круг на карте: центр и радиус. Полигон был бы точнее, но
-- потребовал бы PostGIS ради одной фигуры, редактора контуров в
-- админке и объяснения участникам, где именно проходит ломаная.
-- Для «центра Лейпцига» круг честнее: его видно целиком и он
-- описывается одной фразой — «километр от Рыночной площади».
--
-- Поле необязательное. Пока три колонки пусты, ничего не
-- меняется: карта не показывается, проверок нет.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS area_latitude     double precision,
  ADD COLUMN IF NOT EXISTS area_longitude    double precision,
  ADD COLUMN IF NOT EXISTS area_radius_meters integer,
  -- Строгий режим: отправка вне поля не принимается.
  -- По умолчанию выключен, и это не осторожность ради осторожности.
  -- Строгий режим требует геопозицию к каждой фотографии; команда,
  -- запретившая доступ или стоящая в арке между домами, не сможет
  -- отправить ничего. Включать осознанно и уметь выключить с
  -- телефона посреди мероприятия.
  ADD COLUMN IF NOT EXISTS area_enforced     boolean NOT NULL DEFAULT false;

-- Центр без радиуса — это не «почти настроено», а сломанная
-- конфигурация: нарисовать круг нечем, проверить нечем.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_area_complete;
ALTER TABLE public.events
  ADD CONSTRAINT events_area_complete CHECK (
    (area_latitude IS NULL AND area_longitude IS NULL AND area_radius_meters IS NULL)
    OR (area_latitude IS NOT NULL AND area_longitude IS NOT NULL AND area_radius_meters IS NOT NULL)
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_area_latitude_range;
ALTER TABLE public.events
  ADD CONSTRAINT events_area_latitude_range CHECK (
    area_latitude IS NULL OR area_latitude BETWEEN -90 AND 90
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_area_longitude_range;
ALTER TABLE public.events
  ADD CONSTRAINT events_area_longitude_range CHECK (
    area_longitude IS NULL OR area_longitude BETWEEN -180 AND 180
  );

-- Нижняя граница — 100 метров: меньше не поле, а точка, и
-- погрешность телефона съест его целиком. Верхняя совпадает с
-- радиусом задания.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_area_radius_range;
ALTER TABLE public.events
  ADD CONSTRAINT events_area_radius_range CHECK (
    area_radius_meters IS NULL OR area_radius_meters BETWEEN 100 AND 20000
  );

-- Строгий режим без поля бессмысленен и опасен: он потребовал бы
-- геопозицию, не имея что ею проверять.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_area_enforced_needs_area;
ALTER TABLE public.events
  ADD CONSTRAINT events_area_enforced_needs_area CHECK (
    area_enforced = false OR area_latitude IS NOT NULL
  );

COMMENT ON COLUMN public.events.area_latitude IS
  'Центр игрового поля. Пусто — поле не задано, карта скрыта.';
COMMENT ON COLUMN public.events.area_radius_meters IS
  'Радиус игрового поля в метрах, 100–20000.';
COMMENT ON COLUMN public.events.area_enforced IS
  'Строгий режим: отправка вне поля отклоняется. Требует геопозицию к каждой фотографии.';

-- ═══ Поле для демонстрационного мероприятия ══════════════════
--
-- Рыночная площадь Лейпцига, километр вокруг: пешком от края
-- до края минут пятнадцать. Режим мягкий.
UPDATE public.events
SET area_latitude      = 51.3397,
    area_longitude     = 12.3731,
    area_radius_meters = 1000
WHERE slug = 'leipzig-2026'
  AND area_latitude IS NULL;

-- ═══ confirm_submission: снимок снаружи поля ═════════════════
--
-- Мягкий режим не отклоняет фотографию, а зовёт человека — тот
-- же принцип, что и с AI: машина может принять или передать
-- организатору, но не отказать. Спорить с командой посреди
-- города некому, а телефон в узкой улице врёт на десятки метров.
--
-- Ветка стоит выше проверки validation_mode намеренно. Иначе
-- задание с автоприёмом засчиталось бы снаружи поля само, и
-- ограничение не значило бы ничего.
--
-- Сигнатура меняется, поэтому старая версия удаляется явно:
-- CREATE OR REPLACE при новом параметре создал бы перегрузку, а
-- вызов по именованным аргументам стал бы неоднозначным.

DROP FUNCTION IF EXISTS public.confirm_submission(
  uuid, text, integer, text, text, uuid, numeric,
  double precision, double precision, double precision, boolean
);

CREATE FUNCTION public.confirm_submission(
  p_submission_id uuid,
  p_image_path    text,
  p_bytes         integer,
  p_mime_type     text,
  p_perceptual_hash text DEFAULT NULL,
  p_duplicate_of  uuid DEFAULT NULL,
  p_duplicate_similarity numeric DEFAULT NULL,
  p_latitude      double precision DEFAULT NULL,
  p_longitude     double precision DEFAULT NULL,
  p_location_accuracy double precision DEFAULT NULL,
  p_ai_available  boolean DEFAULT false,
  p_outside_area  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub    public.submissions%ROWTYPE;
  v_task   public.tasks%ROWTYPE;
  v_event  public.events%ROWTYPE;
  v_status public.submission_status;
  v_reason text;
BEGIN
  SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'submission_not_found');
  END IF;

  -- Повторное подтверждение той же отправки безопасно.
  IF v_sub.status <> 'uploading' THEN
    RETURN jsonb_build_object(
      'ok', true, 'status', v_sub.status, 'alreadyConfirmed', true
    );
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_sub.task_id;
  SELECT * INTO v_event FROM public.events WHERE id = v_sub.event_id;

  IF p_duplicate_of IS NOT NULL THEN
    -- Похожее фото не отклоняем: решает человек.
    v_status := 'manual_review';
    v_reason := 'possible_duplicate';
  ELSIF p_outside_area THEN
    v_status := 'manual_review';
    v_reason := 'outside_play_area';
  ELSIF v_task.validation_mode = 'auto' THEN
    v_status := 'accepted';
    v_reason := NULL;
  ELSIF v_task.validation_mode = 'manual' THEN
    v_status := 'manual_review';
    v_reason := 'manual_mode';
  ELSIF v_event.ai_validation_enabled AND p_ai_available THEN
    v_status := 'pending';
    v_reason := NULL;
  ELSE
    -- AI выключен или не настроен — мероприятие продолжается,
    -- фотография просто ждёт организатора.
    v_status := 'manual_review';
    v_reason := 'ai_unavailable';
  END IF;

  UPDATE public.submissions
  SET image_path        = p_image_path,
      bytes             = p_bytes,
      mime_type         = p_mime_type,
      perceptual_hash   = p_perceptual_hash,
      duplicate_submission_id = p_duplicate_of,
      duplicate_similarity    = p_duplicate_similarity,
      latitude          = p_latitude,
      longitude         = p_longitude,
      location_accuracy = p_location_accuracy,
      status            = v_status,
      review_reason     = v_reason,
      submitted_at      = now()
  WHERE id = p_submission_id;

  IF v_status = 'pending' THEN
    INSERT INTO public.validation_jobs (submission_id, status)
    VALUES (p_submission_id, 'queued')
    ON CONFLICT (submission_id) DO UPDATE
      SET status = 'queued', available_at = now(), locked_at = NULL, locked_by = NULL;
  END IF;

  IF v_status = 'accepted' THEN
    PERFORM public.accept_submission(
      p_submission_id, v_task.points, NULL, 'auto_validation'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'reviewReason', v_reason);
END
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_submission(
  uuid, text, integer, text, text, uuid, numeric,
  double precision, double precision, double precision, boolean, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_submission(
  uuid, text, integer, text, text, uuid, numeric,
  double precision, double precision, double precision, boolean, boolean
) TO service_role;
