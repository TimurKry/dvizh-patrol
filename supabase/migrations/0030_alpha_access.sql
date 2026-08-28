-- ─────────────────────────────────────────────────────────────
-- 0030 — Альфа-доступ и возвращённый весь пул
--
-- Служебных команд оказалось две разновидности, а флаг был один.
--
-- **Проверка контента.** Организатор смотрит задания поштучно: по
-- одному эталону, по одной формулировке. Ему нужен весь пул на
-- руке — это то, что делал `is_test` до сих пор.
--
-- **Альфа-тест.** Команда живых людей проходит кусок игры до
-- мероприятия: рука из шести, перевороты, дорога, съёмка, живая
-- проверка ИИ. Всё как на квесте, кроме одного — их зачёты не
-- выносят задания из общего пула, иначе к пятому сентября играть
-- будет нечем.
--
-- Общее у них ровно то, что уже умеет `is_test`: не забирать
-- задания и работать вне статуса мероприятия. Различие — только в
-- размере руки, и оно вынесено в отдельный флаг `full_pool`.
-- Проверочное ограничение не даёт завести «весь пул у обычной
-- команды»: такая комбинация означала бы утечку всего квеста
-- участнику.
--
-- Заодно исправлено упущение 0029: там `refill_team_hand` была
-- переписана ради обхода отказов, и ветка «служебной команде —
-- весь пул» из неё выпала. Здесь она возвращается, но уже на
-- `full_pool`.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS full_pool boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.teams.full_pool IS
  'Весь пул заданий на руке вместо шести карточек. Только для служебных команд: режим проверки контента.';

-- Команды, заведённые до этой миграции, проверяли именно контент —
-- им весь пул и оставляем.
UPDATE public.teams SET full_pool = true WHERE is_test AND NOT full_pool;

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_full_pool_requires_test;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_full_pool_requires_test
  CHECK (NOT full_pool OR is_test);

-- ═══ Рука: весь пул только по full_pool ══════════════════════

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

  -- Весь пул — только команде проверки контента. Альфа-команда
  -- играет настоящей рукой: смысл альфы в том, чтобы пройти путь
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
  'Снимает отыгравшие карточки и добирает руку до 2+2+2, минуя те, от которых команда отказалась. Команде с full_pool раздаёт весь пул. Лок на команду не даёт параллельным запросам раздать лишнее.';

-- ═══ Смена режима чистит руку ════════════════════════════════

/**
 * Переключение доступа команды.
 *
 * Одним действием, а не двумя полями по отдельности: `is_test` и
 * `full_pool` связаны ограничением, и порядок обновлений имеет
 * значение — снять `is_test` раньше `full_pool` нельзя.
 *
 * Рука сбрасывается при каждой смене. Иначе команда, вышедшая из
 * проверки контента, осталась бы с полусотней карточек на руках, а
 * вошедшая в неё — с шестью до первого пополнения. Отказы при этом
 * не трогаются: они принадлежат команде, а не режиму.
 */
CREATE OR REPLACE FUNCTION public.set_team_access(
  p_team_id uuid,
  p_access  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
BEGIN
  IF p_access NOT IN ('normal', 'alpha', 'preview') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_access');
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;

  UPDATE public.teams
  SET is_test   = (p_access <> 'normal'),
      full_pool = (p_access = 'preview')
  WHERE id = p_team_id;

  DELETE FROM public.team_hand WHERE team_id = p_team_id;
  PERFORM public.refill_team_hand(p_team_id);

  RETURN jsonb_build_object('ok', true, 'access', p_access);
END
$$;

COMMENT ON FUNCTION public.set_team_access IS
  'Ставит команде режим доступа: normal, alpha или preview. Рука пересобирается под новый режим.';

REVOKE ALL ON FUNCTION public.set_team_access(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_access(uuid, text) TO service_role;
