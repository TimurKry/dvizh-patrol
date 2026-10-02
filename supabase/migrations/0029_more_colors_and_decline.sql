-- ─────────────────────────────────────────────────────────────
-- 0029 — Ещё четыре цвета команд и отказ от карточки
--
-- Две вещи, обе всплыли за неделю до квеста.
--
-- 1. Цветов было шесть, а команд ожидается больше. Седьмая
--    команда получала NULL и красилась цветом по умолчанию —
--    то есть становилась неотличима от розовой. Добавлены
--    четыре: всего десять, ровно столько, сколько с самого
--    начала предполагал комментарий к next_team_color.
--
-- 2. Отказ от карточки. Команда, застрявшая на задании, до сих
--    пор могла только сжечь попытки или носить карту до конца
--    квеста. Теперь карту можно вернуть в колоду и получить
--    вместо неё другую.
--
-- Три решения по отказу, которые стоит объяснить.
--
-- **Отказ окончателен для этой команды.** Иначе он превращается
-- в бесплатную перетасовку: отказался, обновил, получил ту же
-- карту обратно. Отказ пишется в team_declines и навсегда
-- исключает задание из раздач именно этой команде. Для остальных
-- задание остаётся в пуле — оно ничьё.
--
-- **Числового лимита нет, и он не нужен.** Каждый отказ
-- необратимо сокращает пул самой команде. Это ограничение
-- сильнее любого счётчика: прокрутить всё подряд можно ровно
-- один раз, и остаться при этом без заданий.
--
-- **Нельзя отказаться, если менять не на что.** Если свободного
-- задания того же типа не осталось, отказ отклоняется. Отдать
-- карту и не получить ничего взамен — строго хуже, чем оставить
-- её на руке, и человек об этом узнает уже после нажатия.
-- ─────────────────────────────────────────────────────────────

-- ═══ Четыре цвета ════════════════════════════════════════════
--
-- ALTER TYPE ... ADD VALUE нельзя выполнить внутри транзакции
-- вместе с использованием нового значения, поэтому значения
-- добавляются здесь, а всё, что их читает, — ниже и в коде.
-- IF NOT EXISTS делает накат повторяемым.

ALTER TYPE public.team_color ADD VALUE IF NOT EXISTS 'lime';
ALTER TYPE public.team_color ADD VALUE IF NOT EXISTS 'teal';
ALTER TYPE public.team_color ADD VALUE IF NOT EXISTS 'purple';
ALTER TYPE public.team_color ADD VALUE IF NOT EXISTS 'coral';

COMMENT ON COLUMN public.teams.color IS
  'Ключ цвета команды, десять значений. Hex — в lib/team-colors.ts, в базе их нет намеренно.';

-- ═══ Отказ от карточки ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.team_declines (
  team_id     uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  task_id     uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  declined_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (team_id, task_id)
);

CREATE INDEX IF NOT EXISTS team_declines_team_idx
  ON public.team_declines (team_id, declined_at);

COMMENT ON TABLE public.team_declines IS
  'Задания, от которых команда отказалась. Ей они больше не раздаются; для остальных команд задание остаётся свободным.';

-- Таблица читается только через SECURITY DEFINER-функции: прямой
-- доступ показал бы командам чужие отказы, а по ним — состав
-- чужих рук.
ALTER TABLE public.team_declines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.team_declines FROM anon, authenticated;

DROP POLICY IF EXISTS team_declines_admin_read ON public.team_declines;
CREATE POLICY team_declines_admin_read ON public.team_declines
  FOR SELECT TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.team_declines TO authenticated;

-- ═══ Раздача обходит отказы ══════════════════════════════════
--
-- Функция переписана целиком: добавлено одно условие NOT EXISTS
-- в выборку пополнения. Остальное — снятие отыгравших карт,
-- лок на команду, добор до 2+2+2 — сохранено как было.

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
  'Снимает отыгравшие карточки и добирает руку до 2+2+2, минуя те, от которых команда отказалась. Лок на команду не даёт параллельным запросам раздать лишнее.';

-- ═══ Сам отказ ═══════════════════════════════════════════════

/**
 * Вернуть карточку в колоду.
 *
 * Проверки идут от самой дешёвой к самой дорогой и в том порядке,
 * в каком человек может на них наткнуться: есть ли команда, лежит
 * ли карта на руке, не отправлено ли уже фото, есть ли чем
 * заменить.
 *
 * Замена ищется до удаления и под тем же локом, что и раздача.
 * Иначе между «проверил, что замена есть» и «удалил карту» другая
 * команда успевает забрать последнее свободное задание типа, и
 * рука остаётся короче на одну.
 */
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
  'Возвращает карточку в колоду: команде она больше не выпадет, вместо неё придёт другая того же типа. Отказ невозможен, если по заданию уже была отправка или заменить его нечем.';

REVOKE ALL ON FUNCTION public.decline_task(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_task(uuid, uuid) TO service_role;
