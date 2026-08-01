-- ─────────────────────────────────────────────────────────────
-- 0002 — Функции
--
-- Здесь живёт вся логика, которая обязана быть атомарной:
-- лимит команд, лимит участников, начисление баллов, очередь.
--
-- Каждая функция SECURITY DEFINER с пустым search_path, поэтому
-- все объекты указаны полным именем. Право на выполнение выдано
-- только service_role — из браузера их не вызвать.
--
-- Соглашение: функции возвращают jsonb вида
--   {"ok": true,  ...данные}
--   {"ok": false, "error": "код_ошибки", ...контекст}
-- Исключения оставлены для настоящих сбоев, а не для бизнес-правил.
-- ─────────────────────────────────────────────────────────────

-- ═══ Регистрация команды ═════════════════════════════════════

-- Атомарно создаёт команду, капитана, согласие и сессию.
--
-- Гонка за последнее место решается advisory-локом на мероприятие:
-- параллельные запросы выстраиваются в очередь, каждый видит
-- актуальное число команд. SELECT COUNT + INSERT без лока дал бы
-- одиннадцатую команду при одновременных запросах.
CREATE OR REPLACE FUNCTION public.register_team(
  p_event_id           uuid,
  p_team_name          text,
  p_captain_name       text,
  p_contact            text,
  p_candidate_codes    text[],
  p_session_token_hash text,
  p_session_ttl_hours  integer,
  p_policy_version     text,
  p_social_consent     boolean DEFAULT false,
  p_user_agent         text DEFAULT NULL,
  p_bypass_limits      boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event       public.events%ROWTYPE;
  v_active      integer;
  v_team_id     uuid;
  v_member_id   uuid;
  v_session_id  uuid;
  v_code        text;
  v_chosen_code text;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  -- Очередь на изменение состава команд этого мероприятия.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('dvizh:team_registration'),
    pg_catalog.hashtext(p_event_id::text)
  );

  IF NOT p_bypass_limits THEN
    IF v_event.status <> 'registration' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
    END IF;

    IF NOT v_event.registration_open THEN
      RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
    END IF;
  END IF;

  SELECT count(*) INTO v_active
  FROM public.teams
  WHERE event_id = p_event_id AND status <> 'cancelled';

  IF v_active >= v_event.max_teams THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'event_full',
      'maxTeams', v_event.max_teams
    );
  END IF;

  -- Имя занято? Проверяем явно, чтобы вернуть понятный код,
  -- а не ловить нарушение уникального индекса.
  IF EXISTS (
    SELECT 1 FROM public.teams
    WHERE event_id = p_event_id
      AND status <> 'cancelled'
      AND lower(btrim(name)) = lower(btrim(p_team_name))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_name_taken');
  END IF;

  -- Коды приходят из crypto.randomBytes на сервере. Берём первый
  -- свободный: коллизия на 10 команд практически невозможна,
  -- но проверить дешевле, чем объяснять пользователю ошибку.
  FOREACH v_code IN ARRAY p_candidate_codes LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.teams WHERE event_id = p_event_id AND join_code = v_code
    ) THEN
      v_chosen_code := v_code;
      EXIT;
    END IF;
  END LOOP;

  IF v_chosen_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'join_code_generation_failed');
  END IF;

  INSERT INTO public.teams (event_id, name, join_code, captain_name, contact, status)
  VALUES (p_event_id, btrim(p_team_name), v_chosen_code, btrim(p_captain_name),
          nullif(btrim(coalesce(p_contact, '')), ''), 'pending')
  RETURNING id INTO v_team_id;

  INSERT INTO public.team_members (team_id, name, is_captain)
  VALUES (v_team_id, btrim(p_captain_name), true)
  RETURNING id INTO v_member_id;

  INSERT INTO public.consents (
    team_id, member_id, member_name,
    participation_consent, photo_processing_consent, social_publication_consent,
    policy_version
  )
  VALUES (
    v_team_id, v_member_id, btrim(p_captain_name),
    true, true, coalesce(p_social_consent, false),
    p_policy_version
  );

  INSERT INTO public.team_sessions (team_id, member_id, token_hash, expires_at, user_agent)
  VALUES (
    v_team_id, v_member_id, p_session_token_hash,
    now() + make_interval(hours => p_session_ttl_hours),
    p_user_agent
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'teamId', v_team_id,
    'memberId', v_member_id,
    'sessionId', v_session_id,
    'joinCode', v_chosen_code,
    'teamsUsed', v_active + 1,
    'maxTeams', v_event.max_teams
  );
END
$$;

COMMENT ON FUNCTION public.register_team IS
  'Атомарное создание команды. Advisory-лок гарантирует, что лимит max_teams не превышается при параллельных запросах.';

-- ═══ Вход в команду по коду ══════════════════════════════════

-- Атомарно добавляет участника. Лок берётся на команду, поэтому
-- два одновременных запроса на последнее место не создадут пятого.
CREATE OR REPLACE FUNCTION public.join_team(
  p_event_id           uuid,
  p_join_code          text,
  p_member_name        text,
  p_session_token_hash text,
  p_session_ttl_hours  integer,
  p_policy_version     text,
  p_social_consent     boolean DEFAULT false,
  p_user_agent         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event      public.events%ROWTYPE;
  v_team       public.teams%ROWTYPE;
  v_count      integer;
  v_member_id  uuid;
  v_session_id uuid;
  v_name       text := btrim(p_member_name);
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  SELECT * INTO v_team
  FROM public.teams
  WHERE event_id = p_event_id AND join_code = upper(btrim(p_join_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_join_code');
  END IF;

  IF v_team.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_cancelled');
  END IF;

  IF v_event.status NOT IN ('registration', 'live', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_joinable');
  END IF;

  SELECT count(*) INTO v_count FROM public.team_members WHERE team_id = v_team.id;

  -- Участник с таким именем уже в команде — считаем это возвратом
  -- того же человека и просто выдаём новую сессию.
  SELECT id INTO v_member_id
  FROM public.team_members
  WHERE team_id = v_team.id AND lower(btrim(name)) = lower(v_name);

  IF v_member_id IS NULL THEN
    IF v_count >= v_event.team_size THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'team_full',
        'teamSize', v_event.team_size
      );
    END IF;

    INSERT INTO public.team_members (team_id, name, is_captain)
    VALUES (v_team.id, v_name, false)
    RETURNING id INTO v_member_id;

    INSERT INTO public.consents (
      team_id, member_id, member_name,
      participation_consent, photo_processing_consent, social_publication_consent,
      policy_version
    )
    VALUES (
      v_team.id, v_member_id, v_name,
      true, true, coalesce(p_social_consent, false),
      p_policy_version
    );
  END IF;

  INSERT INTO public.team_sessions (team_id, member_id, token_hash, expires_at, user_agent)
  VALUES (
    v_team.id, v_member_id, p_session_token_hash,
    now() + make_interval(hours => p_session_ttl_hours),
    p_user_agent
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'teamId', v_team.id,
    'teamName', v_team.name,
    'memberId', v_member_id,
    'sessionId', v_session_id
  );
END
$$;

-- ═══ Создание отправки ═══════════════════════════════════════

-- Резервирует место под фотографию: проверяет все правила и
-- создаёт строку со статусом uploading. Путь в Storage строится
-- из id отправки, поэтому строка нужна до загрузки файла.
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

-- ═══ Подтверждение загрузки ══════════════════════════════════

-- Вызывается после того, как файл реально оказался в Storage.
-- Здесь решается судьба отправки: принять сразу, отдать AI или
-- отправить организатору.
CREATE OR REPLACE FUNCTION public.confirm_submission(
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
  p_ai_available  boolean DEFAULT false
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

-- ═══ Начисление баллов ═══════════════════════════════════════

-- Идемпотентно. Повторный вызов не начисляет баллы второй раз:
-- частичный уникальный индекс допускает лишь одну действующую
-- транзакцию task_accepted на отправку.
CREATE OR REPLACE FUNCTION public.accept_submission(
  p_submission_id uuid,
  p_points        integer DEFAULT NULL,
  p_admin_id      uuid DEFAULT NULL,
  p_reason        text DEFAULT NULL,
  p_comment       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub      public.submissions%ROWTYPE;
  v_task     public.tasks%ROWTYPE;
  v_points   integer;
  v_existing uuid;
  v_other    uuid;
  v_tx_id    uuid;
BEGIN
  SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'submission_not_found');
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_sub.task_id;
  v_points := coalesce(p_points, v_task.points);

  IF v_points < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_points');
  END IF;

  -- Уже есть действующее начисление — выходим, не трогая журнал.
  SELECT id INTO v_existing
  FROM public.score_transactions
  WHERE submission_id = p_submission_id
    AND transaction_type = 'task_accepted'
    AND reversed_by_transaction_id IS NULL;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'alreadyAccepted', true,
      'transactionId', v_existing, 'points', v_sub.awarded_points
    );
  END IF;

  -- Другая отправка по этому же заданию уже принята.
  SELECT id INTO v_other
  FROM public.submissions
  WHERE team_id = v_sub.team_id
    AND task_id = v_sub.task_id
    AND status = 'accepted'
    AND id <> p_submission_id;

  IF v_other IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'task_already_accepted', 'submissionId', v_other
    );
  END IF;

  UPDATE public.submissions
  SET status         = 'accepted',
      awarded_points = v_points,
      reviewed_by    = p_admin_id,
      reviewed_at    = now(),
      admin_comment  = coalesce(p_comment, admin_comment)
  WHERE id = p_submission_id;

  INSERT INTO public.score_transactions (
    event_id, team_id, submission_id, points, transaction_type, reason, created_by
  )
  VALUES (
    v_sub.event_id, v_sub.team_id, p_submission_id, v_points,
    'task_accepted', coalesce(p_reason, 'accepted'), p_admin_id
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'ok', true, 'alreadyAccepted', false,
    'transactionId', v_tx_id, 'points', v_points
  );
END
$$;

COMMENT ON FUNCTION public.accept_submission IS
  'Идемпотентное принятие отправки. Повторный вызов возвращает существующую транзакцию и не дублирует баллы.';

-- ═══ Отмена принятой отправки ════════════════════════════════

-- Старую транзакцию не удаляем: пишем обратную и связываем их.
-- После отмены задание снова можно принять.
CREATE OR REPLACE FUNCTION public.revoke_submission(
  p_submission_id uuid,
  p_admin_id      uuid DEFAULT NULL,
  p_reason        text DEFAULT NULL,
  p_new_status    public.submission_status DEFAULT 'rejected'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub       public.submissions%ROWTYPE;
  v_original  public.score_transactions%ROWTYPE;
  v_reversal  uuid;
BEGIN
  SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'submission_not_found');
  END IF;

  SELECT * INTO v_original
  FROM public.score_transactions
  WHERE submission_id = p_submission_id
    AND transaction_type = 'task_accepted'
    AND reversed_by_transaction_id IS NULL
  FOR UPDATE;

  IF FOUND THEN
    INSERT INTO public.score_transactions (
      event_id, team_id, submission_id, points, transaction_type,
      reason, created_by, reverses_transaction_id
    )
    VALUES (
      v_original.event_id, v_original.team_id, p_submission_id, -v_original.points,
      'submission_revoked', coalesce(p_reason, 'revoked'), p_admin_id, v_original.id
    )
    RETURNING id INTO v_reversal;

    UPDATE public.score_transactions
    SET reversed_by_transaction_id = v_reversal
    WHERE id = v_original.id;
  END IF;

  UPDATE public.submissions
  SET status         = p_new_status,
      awarded_points = 0,
      reviewed_by    = p_admin_id,
      reviewed_at    = now(),
      admin_comment  = coalesce(p_reason, admin_comment)
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reversed', v_reversal IS NOT NULL,
    'reversalTransactionId', v_reversal
  );
END
$$;

-- ═══ Ручная корректировка баллов ═════════════════════════════

CREATE OR REPLACE FUNCTION public.adjust_team_score(
  p_team_id  uuid,
  p_points   integer,
  p_type     public.score_transaction_type,
  p_reason   text,
  p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team  public.teams%ROWTYPE;
  v_tx_id uuid;
BEGIN
  IF p_type NOT IN ('manual_adjustment', 'bonus', 'penalty') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transaction_type');
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  INSERT INTO public.score_transactions (
    event_id, team_id, points, transaction_type, reason, created_by
  )
  VALUES (v_team.event_id, p_team_id, p_points, p_type, btrim(p_reason), p_admin_id)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('ok', true, 'transactionId', v_tx_id);
END
$$;

-- ═══ Ручная проверка ═════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_submission_manual_review(
  p_submission_id uuid,
  p_reason        text,
  p_ai_result     jsonb DEFAULT NULL,
  p_confidence    numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.submissions
  SET status        = 'manual_review',
      review_reason = p_reason,
      ai_result     = coalesce(p_ai_result, ai_result),
      ai_confidence = coalesce(p_confidence, ai_confidence)
  WHERE id = p_submission_id
    AND status IN ('pending', 'checking', 'uploading');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'changed', true);
END
$$;

-- ═══ Очередь проверок ════════════════════════════════════════

-- Забирает пачку задач. SKIP LOCKED позволяет запускать несколько
-- воркеров одновременно: каждый берёт свои строки и не ждёт чужих.
-- Заодно возвращает в очередь задачи, зависшие в processing.
CREATE OR REPLACE FUNCTION public.claim_validation_jobs(
  p_worker_id     text,
  p_limit         integer DEFAULT 4,
  p_stale_minutes integer DEFAULT 5
)
RETURNS TABLE (
  job_id        uuid,
  submission_id uuid,
  attempts      integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Воркер мог умереть, не сняв блокировку.
  UPDATE public.validation_jobs
  SET status = 'queued', locked_at = NULL, locked_by = NULL
  WHERE status = 'processing'
    AND locked_at < now() - make_interval(mins => p_stale_minutes);

  RETURN QUERY
  WITH ready AS (
    SELECT j.id
    FROM public.validation_jobs j
    WHERE j.status = 'queued'
      AND j.available_at <= now()
    ORDER BY j.available_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.validation_jobs j
    SET status    = 'processing',
        locked_at = now(),
        locked_by = p_worker_id,
        attempts  = j.attempts + 1
    FROM ready
    WHERE j.id = ready.id
    RETURNING j.id, j.submission_id, j.attempts
  )
  SELECT c.id, c.submission_id, c.attempts FROM claimed c;

  -- Участник должен видеть, что фотография уже проверяется.
  UPDATE public.submissions s
  SET status = 'checking'
  FROM public.validation_jobs j
  WHERE j.submission_id = s.id
    AND j.locked_by = p_worker_id
    AND j.status = 'processing'
    AND s.status = 'pending';
END
$$;

CREATE OR REPLACE FUNCTION public.complete_validation_job(p_job_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.validation_jobs
  SET status = 'completed', completed_at = now(), locked_at = NULL,
      locked_by = NULL, last_error = NULL
  WHERE id = p_job_id;
$$;

-- Ошибка проверки: либо повтор с задержкой, либо ручная проверка.
-- AI никогда не отклоняет отправку окончательно.
CREATE OR REPLACE FUNCTION public.fail_validation_job(
  p_job_id        uuid,
  p_error         text,
  p_max_attempts  integer DEFAULT 2,
  p_retry_delay_seconds integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.validation_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.validation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_found');
  END IF;

  IF v_job.attempts >= p_max_attempts THEN
    UPDATE public.validation_jobs
    SET status = 'failed', last_error = p_error, locked_at = NULL,
        locked_by = NULL, completed_at = now()
    WHERE id = p_job_id;

    PERFORM public.mark_submission_manual_review(v_job.submission_id, 'ai_error');

    RETURN jsonb_build_object('ok', true, 'retrying', false);
  END IF;

  UPDATE public.validation_jobs
  SET status = 'queued', last_error = p_error, locked_at = NULL, locked_by = NULL,
      available_at = now() + make_interval(secs => p_retry_delay_seconds)
  WHERE id = p_job_id;

  RETURN jsonb_build_object('ok', true, 'retrying', true);
END
$$;

-- Кнопка «Повторно обработать зависшие отправки».
CREATE OR REPLACE FUNCTION public.requeue_stale_validations(
  p_event_id      uuid,
  p_stale_minutes integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_jobs integer := 0;
  v_orphans integer := 0;
BEGIN
  -- Зависшие в processing.
  WITH stuck AS (
    UPDATE public.validation_jobs j
    SET status = 'queued', locked_at = NULL, locked_by = NULL, available_at = now()
    FROM public.submissions s
    WHERE j.submission_id = s.id
      AND s.event_id = p_event_id
      AND j.status = 'processing'
      AND j.locked_at < now() - make_interval(mins => p_stale_minutes)
    RETURNING j.id
  )
  SELECT count(*) INTO v_jobs FROM stuck;

  -- Отправки, застрявшие в checking без живой задачи.
  WITH orphaned AS (
    UPDATE public.submissions s
    SET status = 'pending'
    WHERE s.event_id = p_event_id
      AND s.status = 'checking'
      AND s.updated_at < now() - make_interval(mins => p_stale_minutes)
      AND NOT EXISTS (
        SELECT 1 FROM public.validation_jobs j
        WHERE j.submission_id = s.id AND j.status = 'processing'
      )
    RETURNING s.id
  )
  SELECT count(*) INTO v_orphans FROM orphaned;

  -- Отправки в pending без задачи вообще (например, после сбоя).
  INSERT INTO public.validation_jobs (submission_id, status)
  SELECT s.id, 'queued'
  FROM public.submissions s
  WHERE s.event_id = p_event_id
    AND s.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.validation_jobs j WHERE j.submission_id = s.id
    )
  ON CONFLICT (submission_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true, 'requeuedJobs', v_jobs, 'releasedSubmissions', v_orphans
  );
END
$$;

-- ═══ Ограничение частоты запросов ════════════════════════════

-- Счётчик фиксированного окна. Возвращает true, если запрос
-- укладывается в лимит.
CREATE OR REPLACE FUNCTION public.touch_rate_limit(
  p_bucket         text,
  p_window_seconds integer,
  p_max_hits       integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window timestamptz;
  v_hits   integer;
BEGIN
  v_window := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (bucket, window_start, hits)
  VALUES (p_bucket, v_window, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET hits = public.rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  RETURN jsonb_build_object(
    'allowed', v_hits <= p_max_hits,
    'hits', v_hits,
    'limit', p_max_hits,
    'resetAt', v_window + make_interval(secs => p_window_seconds)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.prune_rate_limits(p_older_than_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - make_interval(hours => p_older_than_hours);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

-- ═══ Права ═══════════════════════════════════════════════════

-- Функции вызывает только сервер под service_role.
-- Браузер не должен иметь возможности дёрнуть их напрямую.
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END
$$;
