-- ─────────────────────────────────────────────────────────────
-- 0009 — Карточная механика и гонка команд
--
-- Три вещи, которых до сих пор не было.
--
-- 1. Цвет команды. Шесть значений, по одному на команду внутри
--    мероприятия. В интерфейс цвет не выходит: он красит рубашку
--    карточки, орнамент и командный маркер. Hex-значения живут
--    в lib/team-colors.ts, база хранит только ключ.
--
-- 2. Тип карточки. Загадка, фото-повтор или городской актив.
--    Рука выдаётся по два на тип, поэтому тип обязан быть
--    отдельным полем, а не выводиться из восьми категорий
--    каждый раз заново.
--
-- 3. Глобальный захват задания. Раньше «одно задание — один раз»
--    действовало в пределах команды: уникальный индекс стоял на
--    паре (team_id, task_id). Теперь задание забирает первая
--    валидно принятая отправка во всём мероприятии, и остальные
--    команды его больше не видят.
--
-- Гарантия захвата — уникальный индекс по task_id среди
-- принятых отправок. Это не «проверка перед вставкой», которую
-- обходят две параллельные транзакции, а ограничение, на котором
-- вторая транзакция обязана упасть. Условный UPDATE в
-- accept_submission нужен только затем, чтобы вместо нарушения
-- ограничения вернуть человеку понятный ответ.
-- ─────────────────────────────────────────────────────────────

-- ═══ Цвет команды ════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_color') THEN
    CREATE TYPE public.team_color AS ENUM (
      'red', 'green', 'blue', 'yellow', 'orange', 'pink'
    );
  END IF;
END
$$;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS color public.team_color;

-- Два одинаковых цвета в одном мероприятии сделали бы рубашки
-- неразличимыми, а весь смысл цвета — узнавать свою команду.
-- Отменённые команды цвет освобождают.
DROP INDEX IF EXISTS public.teams_event_color_key;
CREATE UNIQUE INDEX teams_event_color_key
  ON public.teams (event_id, color)
  WHERE color IS NOT NULL AND status <> 'cancelled';

COMMENT ON COLUMN public.teams.color IS
  'Ключ цвета команды. Hex-значения — в lib/team-colors.ts, в базе их нет намеренно.';

-- Назначение свободного цвета. Порядок фиксированный, а не
-- случайный: организатор, заводящий команды подряд, получает
-- предсказуемую последовательность и не гадает, что выпадет.
CREATE OR REPLACE FUNCTION public.next_team_color(p_event_id uuid)
RETURNS public.team_color
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- WITH ORDINALITY и явная сортировка обязательны: без них
  -- планировщик волен переставить строки анти-соединения, и
  -- «первый свободный» превращается в «какой попадётся».
  SELECT palette.color
  FROM unnest(enum_range(NULL::public.team_color)) WITH ORDINALITY AS palette(color, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.event_id = p_event_id
      AND t.color = palette.color
      AND t.status <> 'cancelled'
  )
  ORDER BY palette.ord
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.next_team_color IS
  'Первый свободный цвет мероприятия. NULL, если все шесть заняты — команд может быть до десяти.';

-- Существующим командам цвета раздаются один раз, при накате.
DO $$
DECLARE
  v_team   record;
  v_color  public.team_color;
BEGIN
  FOR v_team IN
    SELECT id, event_id FROM public.teams
    WHERE color IS NULL AND status <> 'cancelled'
    ORDER BY created_at
  LOOP
    v_color := public.next_team_color(v_team.event_id);
    EXIT WHEN v_color IS NULL;
    UPDATE public.teams SET color = v_color WHERE id = v_team.id;
  END LOOP;
END
$$;

-- ═══ Тип карточки ════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_card_type') THEN
    CREATE TYPE public.task_card_type AS ENUM ('riddle', 'photo', 'active');
  END IF;
END
$$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS card_type public.task_card_type;

-- Раскладка по восьми существующим категориям. Она нужна ровно
-- один раз — дальше тип задаёт организатор в админке, а
-- категория остаётся для фильтров и экспорта.
UPDATE public.tasks
SET card_type = CASE category
  -- Найти по описанию: подсказка есть, места нет.
  WHEN 'object_search' THEN 'riddle'
  WHEN 'special'       THEN 'riddle'
  -- Повторить то, что видно: памятник, знак, реклама.
  WHEN 'monuments'     THEN 'photo'
  WHEN 'road_signs'    THEN 'photo'
  WHEN 'advertising'   THEN 'photo'
  -- Сделать что-то в городе, а не просто снять.
  WHEN 'interaction'   THEN 'active'
  WHEN 'team'          THEN 'active'
  WHEN 'creative'      THEN 'active'
  ELSE 'photo'
END::public.task_card_type
WHERE card_type IS NULL;

ALTER TABLE public.tasks
  ALTER COLUMN card_type SET NOT NULL,
  ALTER COLUMN card_type SET DEFAULT 'photo';

CREATE INDEX IF NOT EXISTS tasks_event_card_type_idx
  ON public.tasks (event_id, card_type, active);

COMMENT ON COLUMN public.tasks.card_type IS
  'Тип карточки: riddle / photo / active. Рука выдаётся по два на тип.';

-- ═══ Глобальный захват задания ═══════════════════════════════

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS claimed_by_team_id    uuid REFERENCES public.teams (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_submission_id uuid REFERENCES public.submissions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at            timestamptz;

-- Захват — это тройка целиком или ничего. Половина заполненных
-- колонок означала бы, что задание вроде занято, но неизвестно
-- кем: восстановить такое состояние нечем.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_claim_complete;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_claim_complete CHECK (
    (claimed_by_team_id IS NULL AND claimed_submission_id IS NULL AND claimed_at IS NULL)
    OR (claimed_by_team_id IS NOT NULL AND claimed_submission_id IS NOT NULL AND claimed_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS tasks_unclaimed_idx
  ON public.tasks (event_id, card_type)
  WHERE claimed_by_team_id IS NULL AND active;

COMMENT ON COLUMN public.tasks.claimed_by_team_id IS
  'Команда, забравшая задание. Ставится атомарно внутри accept_submission.';

-- Главная гарантия гонки: у задания не может быть двух принятых
-- отправок во всём мероприятии. Прежний индекс по (team_id,
-- task_id) был слабее — он допускал по одной принятой отправке
-- на каждую команду.
DROP INDEX IF EXISTS public.submissions_one_accepted_per_task_key;

CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_global_accept_key
  ON public.submissions (task_id)
  WHERE status = 'accepted';

COMMENT ON INDEX public.submissions_one_global_accept_key IS
  'Задание забирает ровно одна команда. Вторая параллельная транзакция падает здесь, а не проходит.';

-- ═══ Рука команды ════════════════════════════════════════════

-- Рука хранится, а не пересобирается на каждый запрос. Иначе
-- обновление страницы перетасовывало бы карточки, и команда,
-- которая уже идёт к памятнику, обнаружила бы на его месте
-- другое задание.
CREATE TABLE IF NOT EXISTS public.team_hand (
  team_id   uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  task_id   uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  dealt_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (team_id, task_id)
);

CREATE INDEX IF NOT EXISTS team_hand_team_idx ON public.team_hand (team_id, dealt_at);

COMMENT ON TABLE public.team_hand IS
  'Шесть карточек на руке команды: по два задания каждого типа. Пополняется сервером.';

-- Сколько карточек каждого типа держим на руке.
CREATE OR REPLACE FUNCTION public.hand_size_per_type()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 2 $$;

/**
 * Пересборка руки.
 *
 * Сначала снимает карточки, которые больше не играют: задание
 * забрали, выключили, вышло окно доступности или команда
 * израсходовала попытки. Затем добирает каждый тип до двух из
 * доступного пула в случайном порядке.
 *
 * Функция SECURITY DEFINER и возвращает только те задания, что
 * оказались на руке. Весь скрытый пул наружу не уходит — это
 * прямое требование: иначе команда прочитала бы все задания
 * разом из ответа сервера.
 */
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
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND OR v_team.status = 'cancelled' THEN
    RETURN;
  END IF;

  -- Лок на команду: два параллельных запроса страницы заданий
  -- не должны добрать по две карточки каждый и выдать восемь.
  PERFORM 1 FROM public.teams WHERE id = p_team_id FOR UPDATE;

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

    v_need := public.hand_size_per_type() - v_have;
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

COMMENT ON FUNCTION public.refill_team_hand IS
  'Снимает отыгравшие карточки и добирает руку до 2+2+2. Лок на команду не даёт параллельным запросам раздать лишнее.';

/**
 * Рука команды для интерфейса.
 *
 * Возвращает ровно те задания, что лежат на руке, вместе с
 * числом потраченных попыток и статусом последней отправки.
 * Больше ничего: остальной пул остаётся скрытым.
 */
CREATE OR REPLACE FUNCTION public.get_team_hand(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.refill_team_hand(p_team_id);

  SELECT coalesce(jsonb_agg(card ORDER BY card ->> 'dealtAt'), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'taskId',       t.id,
      'number',       t.number,
      'title',        t.title,
      'shortDescription', t.short_description,
      'description',  t.description,
      'cardType',     t.card_type,
      'category',     t.category,
      'difficulty',   t.difficulty,
      'points',       t.points,
      'maxAttempts',  t.max_attempts,
      'minimumPeople', t.minimum_people,
      'requireLocation', t.require_location,
      'latitude',     t.latitude,
      'longitude',    t.longitude,
      'radiusMeters', t.radius_meters,
      'criteria',     t.criteria,
      'dealtAt',      h.dealt_at,
      'attemptsUsed', (
        SELECT count(*) FROM public.submissions s
        WHERE s.team_id = p_team_id
          AND s.task_id = t.id
          AND s.status IN ('pending', 'checking', 'accepted', 'manual_review', 'rejected')
      ),
      'lastStatus', (
        SELECT s.status FROM public.submissions s
        WHERE s.team_id = p_team_id AND s.task_id = t.id
        ORDER BY s.submitted_at DESC LIMIT 1
      )
    ) AS card
    FROM public.team_hand h
    JOIN public.tasks t ON t.id = h.task_id
    WHERE h.team_id = p_team_id
  ) cards;

  RETURN jsonb_build_object('ok', true, 'hand', v_result);
END
$$;

COMMENT ON FUNCTION public.get_team_hand IS
  'Шесть карточек команды и ничего сверх. Скрытый пул заданий в браузер не уходит.';

-- ═══ Захват внутри accept_submission ═════════════════════════

-- Функция переписана целиком: добавлен глобальный захват между
-- проверками и начислением. Остальная логика — идемпотентность,
-- баллы из задания, запись в журнал — сохранена как была.
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
  UPDATE public.tasks
  SET claimed_by_team_id    = v_sub.team_id,
      claimed_submission_id = p_submission_id,
      claimed_at            = now()
  WHERE id = v_sub.task_id
    AND claimed_by_team_id IS NULL;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;

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
  DELETE FROM public.team_hand WHERE task_id = v_sub.task_id;

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

COMMENT ON FUNCTION public.accept_submission IS
  'Идемпотентное принятие отправки с глобальным захватом задания. Повторный вызов возвращает существующую транзакцию и не дублирует баллы.';

-- ═══ Освобождение при отмене ═════════════════════════════════

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
  v_released  boolean := false;
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

  -- Отмена возвращает задание в игру. Не освободить его значило
  -- бы вычеркнуть задание из мероприятия навсегда из-за ошибки
  -- проверяющего.
  UPDATE public.tasks
  SET claimed_by_team_id    = NULL,
      claimed_submission_id = NULL,
      claimed_at            = NULL
  WHERE id = v_sub.task_id
    AND claimed_submission_id = p_submission_id;

  GET DIAGNOSTICS v_released = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'reversed', v_reversal IS NOT NULL,
    'reversalTransactionId', v_reversal,
    'taskReleased', v_released
  );
END
$$;

COMMENT ON FUNCTION public.revoke_submission IS
  'Отмена начисления обратной транзакцией. Задание возвращается в общий пул.';

-- ═══ Цвет при регистрации ════════════════════════════════════

-- Новая команда получает первый свободный цвет сразу, чтобы
-- рубашка карточек не оставалась серой до вмешательства
-- организатора.
CREATE OR REPLACE FUNCTION public.assign_team_color()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.color IS NULL THEN
    NEW.color := public.next_team_color(NEW.event_id);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS teams_assign_color ON public.teams;
CREATE TRIGGER teams_assign_color
  BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.assign_team_color();

-- ═══ Права ═══════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.get_team_hand(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refill_team_hand(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_team_color(uuid) TO service_role, authenticated;

-- team_hand читается только через SECURITY DEFINER-функции:
-- прямой доступ дал бы командам возможность посмотреть чужие руки.
ALTER TABLE public.team_hand ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.team_hand FROM anon, authenticated;

CREATE POLICY team_hand_admin_read ON public.team_hand
  FOR SELECT TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.team_hand TO authenticated;
