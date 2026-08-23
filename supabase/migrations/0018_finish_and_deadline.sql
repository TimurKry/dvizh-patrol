-- ═══════════════════════════════════════════════════════════════
-- 0018 · Конец игры по времени и место сбора
--
-- Квест заканчивался только кнопкой организатора, а организатор в
-- этот момент сам где-то в городе. Колонка `ends_at` в схеме была
-- с самого начала и не использовалась нигде — ни отсчёта, ни
-- закрытия отправок. Теперь она работает: после срока сервер
-- отправки не принимает.
--
-- Статус мероприятия при этом не меняется сам. Автоматически
-- переключать его некому: на бесплатном тарифе Vercel регулярные
-- задания запускаются раз в сутки, а надеяться на то, что кто-то
-- откроет страницу ровно в нужную минуту, нельзя. Поэтому время
-- закрывает окно отправок, а «Завершить» остаётся за организатором
-- — и это честнее: он завершает квест, когда все дошли, а не когда
-- истекла минута.
--
-- Место сбора — вторая половина. Игра заканчивается не таблицей, а
-- тем, что все встречаются и идут на закупку к BBQ. Раньше об этом
-- было написано только на лендинге, то есть там, где участник в
-- этот момент точно не находится.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS finish_latitude  double precision,
  ADD COLUMN IF NOT EXISTS finish_longitude double precision,
  ADD COLUMN IF NOT EXISTS finish_title     text,
  ADD COLUMN IF NOT EXISTS finish_address   text,
  ADD COLUMN IF NOT EXISTS finish_note      text,
  ADD COLUMN IF NOT EXISTS finish_at        timestamptz;

-- Половина координаты — это не место, а ошибка ввода.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_finish_point_complete;
ALTER TABLE public.events
  ADD CONSTRAINT events_finish_point_complete CHECK (
    (finish_latitude IS NULL) = (finish_longitude IS NULL)
  );

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_finish_latitude_range;
ALTER TABLE public.events
  ADD CONSTRAINT events_finish_latitude_range CHECK (
    finish_latitude IS NULL OR finish_latitude BETWEEN -90 AND 90
  );

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_finish_longitude_range;
ALTER TABLE public.events
  ADD CONSTRAINT events_finish_longitude_range CHECK (
    finish_longitude IS NULL OR finish_longitude BETWEEN -180 AND 180
  );

-- Встреча после игры, а не до неё.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_finish_after_start;
ALTER TABLE public.events
  ADD CONSTRAINT events_finish_after_start CHECK (
    finish_at IS NULL OR finish_at > starts_at
  );

COMMENT ON COLUMN public.events.ends_at IS
  'Когда закрывается приём отправок. Пусто — только кнопкой организатора. Статус этим не меняется.';
COMMENT ON COLUMN public.events.finish_title IS
  'Название места сбора: «Clara-Zetkin-Park, у главного входа».';
COMMENT ON COLUMN public.events.finish_note IS
  'Что сказать команде на финише: что взять с собой, куда идти дальше.';

-- ═══ Окно отправок закрывается временем ══════════════════════
--
-- Проверка в базе, а не в интерфейсе. Страница участника могла
-- открыться до срока и провисеть в кармане полчаса; закрытие окна
-- — правило игры, и обойти его клиентом нельзя.

CREATE OR REPLACE FUNCTION public.create_submission_slot(
  p_team_id         uuid,
  p_task_id         uuid,
  p_member_id       uuid,
  p_idempotency_key text,
  p_allow_paused    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team     public.teams%ROWTYPE;
  v_task     public.tasks%ROWTYPE;
  v_event    public.events%ROWTYPE;
  v_existing public.submissions%ROWTYPE;
  v_attempts integer;
  v_id       uuid;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;

  IF v_team.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_cancelled');
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found');
  END IF;

  -- Задание и команда обязаны принадлежать одному мероприятию.
  IF v_task.event_id <> v_team.event_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_event_mismatch');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_team.event_id;

  IF v_event.status <> 'live' AND NOT (p_allow_paused AND v_event.status = 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_live', 'status', v_event.status);
  END IF;

  -- Время вышло. Проверка здесь, а не в интерфейсе: страница
  -- участника могла открыться до срока и провисеть в кармане
  -- полчаса, а закрытие окна отправок — правило игры, а не
  -- оформление. Статус при этом остаётся «Идёт»: организатор
  -- завершает квест кнопкой, когда все дошли до места сбора.
  IF v_event.ends_at IS NOT NULL AND now() > v_event.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_over', 'endsAt', v_event.ends_at);
  END IF;

  IF NOT v_task.active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_inactive');
  END IF;

  IF v_task.available_from IS NOT NULL AND now() < v_task.available_from THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_available_yet');
  END IF;

  IF v_task.available_until IS NOT NULL AND now() > v_task.available_until THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_no_longer_available');
  END IF;

  -- Повтор того же запроса после обрыва связи возвращает
  -- уже созданную отправку, а не делает вторую.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.submissions
    WHERE team_id = p_team_id
      AND task_id = p_task_id
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'submissionId', v_existing.id,
        'attemptNumber', v_existing.attempt_number,
        'status', v_existing.status,
        'reused', true
      );
    END IF;
  END IF;

  -- Строка команды блокируется, чтобы параллельные отправки
  -- не обошли лимит попыток.
  PERFORM 1 FROM public.teams WHERE id = p_team_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.submissions
    WHERE team_id = p_team_id AND task_id = p_task_id AND status = 'accepted'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  -- Неудачные загрузки и отменённые отправки попытку не тратят.
  SELECT count(*) INTO v_attempts
  FROM public.submissions
  WHERE team_id = p_team_id
    AND task_id = p_task_id
    AND status IN ('pending', 'checking', 'accepted', 'manual_review', 'rejected');

  IF v_attempts >= v_task.max_attempts THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'attempt_limit_reached',
      'maxAttempts', v_task.max_attempts
    );
  END IF;

  INSERT INTO public.submissions (
    event_id, team_id, task_id, member_id,
    status, attempt_number, idempotency_key
  )
  VALUES (
    v_team.event_id, p_team_id, p_task_id, p_member_id,
    'uploading', v_attempts + 1, p_idempotency_key
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'submissionId', v_id,
    'attemptNumber', v_attempts + 1,
    'requireLocation', v_task.require_location,
    'validationMode', v_task.validation_mode,
    'reused', false
  );
END
$$;
