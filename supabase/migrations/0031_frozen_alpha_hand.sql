-- ─────────────────────────────────────────────────────────────
-- 0031 — Рука альфа-теста не пополняется
--
-- Альфа-команда получала новую карточку взамен зачтённой, как
-- настоящая. Для теста это неверно: смысл альфы в том, чтобы дать
-- людям потрогать шесть конкретных карточек перед мероприятием, а
-- не выдать им бесконечный квест. Отыгранная карточка должна
-- остаться на руке с пометкой, что она отыграна.
--
-- Поэтому у альфы рука раздаётся ровно один раз и дальше не
-- меняется: ни пополнения, ни снятия отыгравших. Проверка стоит
-- на непустой руке, а не на счётчике — так функция остаётся
-- идемпотентной и переживает любое число вызовов подряд.
--
-- Настоящей игры это не касается: у обычных команд карточка
-- по-прежнему уходит после зачёта и заменяется новой. Проверки
-- контента тоже: там весь пул, и заменять нечего.
--
-- Заново раздать альфе руку можно переключением режима — оно
-- чистит `team_hand` и вызывает раздачу.
-- ─────────────────────────────────────────────────────────────

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

  -- Альфа-тест: рука раздаётся один раз и застывает.
  --
  -- Условие стоит до всего остального, включая снятие отыгравших
  -- карточек: зачтённое задание должно остаться на руке, чтобы
  -- тестировщик видел его отмеченным, а не гадал, куда делась
  -- карта, которую он только что сдал.
  IF v_team.is_test AND NOT v_team.full_pool THEN
    IF EXISTS (SELECT 1 FROM public.team_hand WHERE team_id = p_team_id) THEN
      RETURN;
    END IF;
  END IF;

  -- Весь пул — только команде проверки контента. Альфа-команда
  -- получает настоящую руку: смысл альфы в том, чтобы пройти путь
  -- участника, а не посмотреть содержимое.
  v_target := CASE WHEN v_team.full_pool THEN 10000 ELSE public.hand_size_per_type() END;

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
      -- Отказ окончателен: задание, от которого команда отказалась,
      -- ей больше не выпадает.
      AND NOT EXISTS (
        SELECT 1 FROM public.team_declines d
        WHERE d.team_id = p_team_id AND d.task_id = t.id
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
  'Добирает руку до 2+2+2, минуя отказы; команде с full_pool раздаёт весь пул; альфе раздаёт один раз и больше не трогает. Лок на команду не даёт параллельным запросам раздать лишнее.';

-- ═══ Отказ альфе недоступен ══════════════════════════════════
--
-- Замороженной руке менять карточку не на что: вместо неё ничего
-- не придёт, и рука просто станет короче. Кнопка у альфы всё
-- равно не показывается, но проверка стоит и на сервере — он не
-- полагается на то, чего не нарисовал клиент.

CREATE OR REPLACE FUNCTION public.decline_task(
  p_team_id uuid,
  p_task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team        public.teams%ROWTYPE;
  v_task        public.tasks%ROWTYPE;
  v_on_hand     boolean;
  v_submissions integer;
  v_replacement uuid;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;

  IF v_team.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_cancelled');
  END IF;

  -- Служебные команды карточки не возвращают: у альфы рука
  -- заморожена, у проверки контента на руке весь пул.
  IF v_team.is_test THEN
    RETURN jsonb_build_object('ok', false, 'error', 'decline_unavailable');
  END IF;

  PERFORM 1 FROM public.teams WHERE id = p_team_id FOR UPDATE;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND OR v_task.event_id <> v_team.event_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.team_hand
    WHERE team_id = p_team_id AND task_id = p_task_id
  ) INTO v_on_hand;

  IF NOT v_on_hand THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_on_hand');
  END IF;

  -- Отправленное назад не берут: иначе отказ стал бы способом
  -- стереть неудачную попытку и зайти на то же задание заново.
  SELECT count(*) INTO v_submissions
  FROM public.submissions s
  WHERE s.team_id = p_team_id
    AND s.task_id = p_task_id
    AND s.status IN ('pending', 'checking', 'accepted', 'manual_review', 'rejected');

  IF v_submissions > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_already_attempted');
  END IF;

  -- Замена того же типа. Условия повторяют выборку раздачи —
  -- расходиться им нельзя, иначе отказ пройдёт, а карта не
  -- придёт.
  SELECT t.id INTO v_replacement
  FROM public.tasks t
  WHERE t.event_id = v_team.event_id
    AND t.card_type = v_task.card_type
    AND t.active
    AND t.claimed_by_team_id IS NULL
    AND t.id <> p_task_id
    AND (t.available_from IS NULL OR now() >= t.available_from)
    AND (t.available_until IS NULL OR now() <= t.available_until)
    AND NOT EXISTS (
      SELECT 1 FROM public.team_hand h WHERE h.team_id = p_team_id AND h.task_id = t.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_declines d
      WHERE d.team_id = p_team_id AND d.task_id = t.id
    )
    AND (
      SELECT count(*) FROM public.submissions s
      WHERE s.team_id = p_team_id
        AND s.task_id = t.id
        AND s.status IN ('pending', 'checking', 'accepted', 'manual_review', 'rejected')
    ) < t.max_attempts
  LIMIT 1;

  IF v_replacement IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_replacement');
  END IF;

  INSERT INTO public.team_declines (team_id, task_id)
  VALUES (p_team_id, p_task_id)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.team_hand
  WHERE team_id = p_team_id AND task_id = p_task_id;

  -- Добор идёт общей функцией, а не вставкой найденной замены:
  -- у неё уже есть весь набор условий, и дублировать его значит
  -- завести второе место, где правила раздачи могут разойтись.
  PERFORM public.refill_team_hand(p_team_id);

  RETURN jsonb_build_object('ok', true, 'declinedTaskId', p_task_id);
END
$$;

COMMENT ON FUNCTION public.decline_task IS
  'Возвращает карточку в колоду: команде она больше не выпадет, вместо неё придёт другая того же типа. Недоступно служебным командам и заданиям, по которым уже была отправка.';

-- ═══ Зачёт не снимает карточку с руки альфы ══════════════════
--
-- Карточку с руки убирает сам `accept_submission`, ещё до того как
-- дело дойдёт до раздачи. Для альфы это неверно: отыгранная
-- карточка должна остаться на месте с пометкой, что она отыграна,
-- иначе тестировщик отправляет фотографию и видит, что карта
-- исчезла.
--
-- Функция переписана целиком: изменён один блок в самом конце.
-- Остальное — идемпотентность, баллы из задания, глобальный
-- захват, журнал — сохранено как было.

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
  v_frozen   boolean;
BEGIN
  SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'submission_not_found');
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_sub.task_id;

  -- Альфа-тест: рука заморожена, снимать с неё ничего нельзя.
  SELECT t.is_test AND NOT t.full_pool INTO v_frozen
  FROM public.teams t WHERE t.id = v_sub.team_id;

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
  -- владельца и получит ноль изменённых строк.
  --
  -- Служебная команда не захватывает ничего: и проверка контента,
  -- и альфа-тест идут до квеста, а задания должны дожить до
  -- участников.
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
  --
  -- У альфы не уходит никуда: её рука заморожена, и отыгранная
  -- карточка остаётся на месте с пометкой. Проверка контента
  -- чужие руки не трогает, но свою карточку снимает — там на руке
  -- весь пул, и повторно она не понадобится.
  IF v_frozen THEN
    NULL;
  ELSIF v_sub.is_test THEN
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

COMMENT ON FUNCTION public.accept_submission IS
  'Засчитывает отправку: атомарно захватывает задание, начисляет баллы, снимает карточку с рук. Служебные команды ничего не захватывают, у альфы карточка остаётся на руке отмеченной.';
