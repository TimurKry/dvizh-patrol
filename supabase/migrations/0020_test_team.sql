-- ═══════════════════════════════════════════════════════════════
-- 0020 · Тестовая команда
--
-- Организатору нужно пройти квест до квеста: проверить каждое
-- задание, посмотреть глазами участника с капитанского и
-- некапитанского входа, убедиться, что загадка вообще
-- разгадывается. Раньше для этого приходилось запускать
-- мероприятие — то есть открывать задания всем, кто уже вошёл по
-- коду, — а потом возвращать назад.
--
-- Теперь у команды есть галочка «для тестов». Такая команда:
--
--   · играет в любом статусе мероприятия и после конца игры;
--   · получает на руки все задания, а не шесть случайных;
--   · ничего не забирает из общего пула — принятая у неё отправка
--     не захватывает задание, и вечером оно достаётся настоящим
--     командам;
--   · не показывается в рейтинге.
--
-- Признак дублируется в отправку. Уникальный индекс «одна
-- принятая отправка на задание» — частичный, а частичный индекс
-- не умеет заглядывать в соседнюю таблицу: без колонки в самой
-- отправке тестовая проверка занимала бы задание намертво.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.teams.is_test IS
  'Команда для проверки заданий: играет вне статуса, видит весь пул, ничего из него не забирает и не попадает в рейтинг.';
COMMENT ON COLUMN public.submissions.is_test IS
  'Копия признака команды на момент отправки. Нужна частичному индексу и очереди проверки.';

-- Одна принятая отправка на задание — но тестовые не в счёт.
DROP INDEX IF EXISTS public.submissions_one_global_accept_key;
CREATE UNIQUE INDEX submissions_one_global_accept_key
  ON public.submissions (task_id)
  WHERE status = 'accepted' AND NOT is_test;

COMMENT ON INDEX public.submissions_one_global_accept_key IS
  'Задание забирает ровно одна настоящая команда. Тестовые проверки в гонке не участвуют.';

-- ═══ Рейтинг без тестовых команд ═════════════════════════════

CREATE OR REPLACE VIEW public.team_scores
WITH (security_invoker = true) AS
SELECT
  t.id                                        AS team_id,
  t.event_id,
  t.name                                      AS team_name,
  t.status                                    AS team_status,
  COALESCE(sum(st.points), 0)::integer        AS total_points,
  COALESCE(
    count(*) FILTER (
      WHERE st.transaction_type = 'task_accepted'
        AND st.reversed_by_transaction_id IS NULL
    ),
    0
  )::integer                                  AS accepted_count,
  max(st.created_at) FILTER (
    WHERE st.transaction_type = 'task_accepted'
      AND st.reversed_by_transaction_id IS NULL
  )                                           AS last_accepted_at,
  t.is_test
FROM public.teams t
LEFT JOIN public.score_transactions st ON st.team_id = t.id
GROUP BY t.id, t.event_id, t.name, t.status, t.is_test;

-- Баллы тестовой команды видны организатору в её карточке, но в
-- таблицу результатов не попадают: там играют настоящие.
CREATE OR REPLACE VIEW public.leaderboard
WITH (security_invoker = true) AS
SELECT
  ts.event_id,
  ts.team_id,
  ts.team_name,
  ts.total_points,
  ts.accepted_count,
  ts.last_accepted_at,
  row_number() OVER w AS position,
  rank()       OVER w AS rank
FROM public.team_scores ts
WHERE ts.team_status <> 'cancelled'
  AND NOT ts.is_test
WINDOW w AS (
  PARTITION BY ts.event_id
  ORDER BY ts.total_points DESC,
           ts.accepted_count DESC,
           ts.last_accepted_at ASC NULLS LAST
);

-- ═══ Вход в тестовую команду ═════════════════════════════════

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
  v_limit      integer;
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

  -- В тестовую команду входят в любом статусе: её и заводят
  -- ради того, чтобы пройти квест до его открытия.
  IF NOT v_team.is_test AND v_event.status NOT IN ('registration', 'live', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_joinable');
  END IF;

  -- Потолок команды важнее общего: организатор поднимает его
  -- точечно той компании, которая пришла большим составом.
  v_limit := coalesce(v_team.size_limit, v_event.team_size);

  SELECT count(*) INTO v_count FROM public.team_members WHERE team_id = v_team.id;

  -- Участник с таким именем уже в команде — считаем это возвратом
  -- того же человека и просто выдаём новую сессию.
  SELECT id INTO v_member_id
  FROM public.team_members
  WHERE team_id = v_team.id AND lower(btrim(name)) = lower(v_name);

  IF v_member_id IS NULL THEN
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'team_full',
        'teamSize', v_limit
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

-- ═══ Рука: тестовой команде — весь пул ═══════════════════════

CREATE OR REPLACE FUNCTION public.refill_team_hand(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team    public.teams%ROWTYPE;
  v_type    public.task_card_type;
  v_have    integer;
  v_need    integer;
  v_target  integer;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND OR v_team.status = 'cancelled' THEN
    RETURN;
  END IF;

  -- Лок на команду: два параллельных запроса страницы заданий
  -- не должны добрать по две карточки каждый и выдать восемь.
  PERFORM 1 FROM public.teams WHERE id = p_team_id FOR UPDATE;

  -- Тестовой команде раздаём всё. Организатор проверяет задания
  -- поштучно — по одному эталону, по одной формулировке, — и рука
  -- из шести случайных карточек означала бы, что до остальных
  -- сорока он доберётся, только удалив команду и заведя заново.
  v_target := CASE WHEN v_team.is_test THEN 10000 ELSE public.hand_size_per_type() END;

  DELETE FROM public.team_hand h
  USING public.tasks t
  WHERE h.team_id = p_team_id
    AND h.task_id = t.id
    AND (
      t.claimed_by_team_id IS NOT NULL
      OR NOT t.active
      OR (t.available_until IS NOT NULL AND now() > t.available_until)
      OR (
        SELECT count(*) FROM public.submissions s
        WHERE s.team_id = p_team_id
          AND s.task_id = t.id
          AND s.status IN ('pending', 'checking', 'accepted', 'manual_review', 'rejected')
      ) >= t.max_attempts
    );

  FOREACH v_type IN ARRAY enum_range(NULL::public.task_card_type)
  LOOP
    SELECT count(*) INTO v_have
    FROM public.team_hand h
    JOIN public.tasks t ON t.id = h.task_id
    WHERE h.team_id = p_team_id AND t.card_type = v_type;

    v_need := v_target - v_have;
    CONTINUE WHEN v_need <= 0;

    INSERT INTO public.team_hand (team_id, task_id)
    SELECT p_team_id, t.id
    FROM public.tasks t
    WHERE t.event_id = v_team.event_id
      AND t.card_type = v_type
      AND t.active
      AND t.claimed_by_team_id IS NULL
      AND (t.available_from IS NULL OR now() >= t.available_from)
      AND (t.available_until IS NULL OR now() <= t.available_until)
      AND NOT EXISTS (
        SELECT 1 FROM public.team_hand h WHERE h.team_id = p_team_id AND h.task_id = t.id
      )
      AND (
        SELECT count(*) FROM public.submissions s
        WHERE s.team_id = p_team_id
          AND s.task_id = t.id
          AND s.status IN ('pending', 'checking', 'accepted', 'manual_review', 'rejected')
      ) < t.max_attempts
    ORDER BY random()
    LIMIT v_need
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$$;

-- ═══ Отправка вне статуса и без захвата ══════════════════════

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

  -- Тестовая команда играет в любом статусе. Ради проверки одного
  -- задания организатору иначе пришлось бы запускать квест на
  -- глазах у всех, кто уже вошёл по коду.
  IF NOT v_team.is_test
     AND v_event.status <> 'live'
     AND NOT (p_allow_paused AND v_event.status = 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_live', 'status', v_event.status);
  END IF;

  -- Время вышло. Проверка здесь, а не в интерфейсе: страница
  -- участника могла открыться до срока и провисеть в кармане
  -- полчаса, а закрытие окна отправок — правило игры, а не
  -- оформление. Статус при этом остаётся «Идёт»: организатор
  -- завершает квест кнопкой, когда все дошли до места сбора.
  IF NOT v_team.is_test AND v_event.ends_at IS NOT NULL AND now() > v_event.ends_at THEN
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
    status, attempt_number, idempotency_key, is_test
  )
  VALUES (
    v_team.event_id, p_team_id, p_task_id, p_member_id,
    'uploading', v_attempts + 1, p_idempotency_key, v_team.is_test
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
  v_claimed  integer;
BEGIN
  SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'submission_not_found');
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_sub.task_id;

  -- Баллы берутся из задания. Организатор может переопределить их
  -- при ручной проверке, но никакого зашитого диапазона здесь нет.
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

  -- Другая отправка той же команды по этому заданию уже принята.
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

  -- ─── Глобальный захват ───────────────────────────────────
  --
  -- Условный UPDATE — это атомарная проверка-и-установка: строка
  -- задания блокируется на время транзакции, и вторая команда
  -- увидит либо NULL и заберёт задание, либо уже проставленного
  -- владельца и получит ноль изменённых строк. Никакого окна
  -- между «проверил» и «записал» здесь нет.
  --
  -- Задание, которое эта же команда уже забрала, повторно не
  -- захватывается: сюда попадает только новая отправка.
  --
  -- Тестовая команда не захватывает ничего. Организатор проверяет
  -- задания заранее, и если бы проверка уносила их из пула, к
  -- вечеру играть было бы нечем.
  IF v_sub.is_test THEN
    v_claimed := 1;
  ELSE
    UPDATE public.tasks
    SET claimed_by_team_id    = v_sub.team_id,
        claimed_submission_id = p_submission_id,
        claimed_at            = now()
    WHERE id = v_sub.task_id
      AND claimed_by_team_id IS NULL;

    GET DIAGNOSTICS v_claimed = ROW_COUNT;
  END IF;

  IF v_claimed = 0 THEN
    -- Кто-то успел раньше. Баллы не начисляются, отправка
    -- получает понятный конечный статус, а не зависает.
    SELECT claimed_by_team_id INTO v_other FROM public.tasks WHERE id = v_sub.task_id;

    UPDATE public.submissions
    SET status        = 'rejected',
        awarded_points = 0,
        reviewed_by   = p_admin_id,
        reviewed_at   = now(),
        review_reason = 'task_claimed_by_other_team'
    WHERE id = p_submission_id;

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'task_claimed_by_other_team',
      'claimedByTeamId', v_other
    );
  END IF;

  -- Уникальный индекс submissions_one_global_accept_key делает
  -- эту строку точкой сериализации: если две транзакции всё же
  -- дошли сюда одновременно, вторая упадёт на ограничении, а не
  -- начислит баллы второй команде.
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

  -- Карточка уходит с рук всех команд: у забравшей — потому что
  -- отыграна, у остальных — потому что задание больше не их.
  -- Тестовая проверка чужие руки не трогает.
  IF v_sub.is_test THEN
    DELETE FROM public.team_hand WHERE task_id = v_sub.task_id AND team_id = v_sub.team_id;
  ELSE
    DELETE FROM public.team_hand WHERE task_id = v_sub.task_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'alreadyAccepted', false,
    'transactionId', v_tx_id, 'points', v_points,
    'claimedTaskId', v_sub.task_id
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Сюда приводит только гонка на submissions_one_global_accept_key.
    RETURN jsonb_build_object('ok', false, 'error', 'task_claimed_by_other_team');
END
$$;
