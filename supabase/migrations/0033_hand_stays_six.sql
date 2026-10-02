-- ─────────────────────────────────────────────────────────────
-- 0033 — Рука держится в шести, даже когда тип кончился
--
-- Раздача добирала руку по типам: по две загадки, две фотозадачи,
-- два актива. Пока в пуле есть задания всех трёх типов, это и
-- даёт шесть карточек.
--
-- Но типы кончаются не одновременно. Актива в пуле восемнадцать
-- на шесть команд — по три на команду, и двенадцать из них
-- постоянно лежат на руках. Он кончится первым, задолго до фото
-- и загадок. Дальше добор по типу просто не находил свободного
-- задания, и рука проседала: шесть карточек, пять, четыре. Хуже
-- всего это выглядит под конец, когда играть ещё есть чем —
-- заданий в пуле десятки, — а на столе пусто.
--
-- Теперь форма 2+2+2 — предпочтение, а не обязательство. Сначала
-- добор по типам, как раньше. Если после него карточек меньше
-- шести, остаток добирается чем угодно: тип, который кончился,
-- замещается тем, который есть.
--
-- Два следствия, оба намеренные.
--
-- **Рука перекашивается.** Когда актив кончится, у команды может
-- оказаться четыре фотозадачи и две загадки. Это лучше, чем
-- четыре карточки: играть важнее, чем соблюдать пропорцию.
--
-- **Перекос не откатывается сам.** Появись потом свободный актив
-- — он придёт только на освободившееся место, а не сверх шести.
-- Иначе рука росла бы: организатор добавляет задания прямо во
-- время квеста, и без потолка команда получила бы восемь карточек
-- вместо шести. Потолок задан явно и держится на каждом шаге.
--
-- Заодно проверка контента вынесена из общего цикла в свою ветку.
-- Раньше «весь пул» изображался целью в 10000 карточек на тип —
-- работало, но потолок в шесть пришлось бы обходить тем же
-- числом. Отдельная ветка честнее: у этого режима нет ни размера
-- руки, ни формы.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refill_team_hand(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team  public.teams%ROWTYPE;
  v_type  public.task_card_type;
  v_have  integer;
  v_need  integer;
  v_added integer;
  v_room  integer;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND OR v_team.status = 'cancelled' THEN
    RETURN;
  END IF;

  -- Лок на команду: два параллельных запроса страницы заданий
  -- не должны добрать по две карточки каждый и выдать восемь.
  PERFORM 1 FROM public.teams WHERE id = p_team_id FOR UPDATE;

  -- Альфа-тест: рука раздаётся один раз и застывает.
  IF v_team.is_test AND NOT v_team.full_pool THEN
    IF EXISTS (SELECT 1 FROM public.team_hand WHERE team_id = p_team_id) THEN
      RETURN;
    END IF;
  END IF;

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

  -- ═══ Проверка контента: весь пул, без формы и потолка ═══
  IF v_team.full_pool THEN
    INSERT INTO public.team_hand (team_id, task_id)
    SELECT p_team_id, t.id
    FROM public.tasks t
    WHERE t.event_id = v_team.event_id
      AND t.active
      AND t.claimed_by_team_id IS NULL
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
    ON CONFLICT DO NOTHING;

    RETURN;
  END IF;

  -- ═══ Сколько всего места на руке ═══════════════════════
  --
  -- Потолок считается от размера руки на тип и числа типов, а не
  -- вписан числом: измени `hand_size_per_type` — и он поедет
  -- следом. Дальше он уменьшается на каждой вставке, поэтому
  -- перебрать его нельзя ни в цикле, ни в доборе.

  SELECT count(*) INTO v_have FROM public.team_hand WHERE team_id = p_team_id;

  v_room :=
    public.hand_size_per_type() * array_length(enum_range(NULL::public.task_card_type), 1)
    - v_have;

  -- ═══ Сначала по типам: 2 + 2 + 2 ═══════════════════════

  FOREACH v_type IN ARRAY enum_range(NULL::public.task_card_type)
  LOOP
    EXIT WHEN v_room <= 0;

    SELECT count(*) INTO v_have
    FROM public.team_hand h
    JOIN public.tasks t ON t.id = h.task_id
    WHERE h.team_id = p_team_id AND t.card_type = v_type;

    v_need := least(public.hand_size_per_type() - v_have, v_room);
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

    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_room := v_room - v_added;
  END LOOP;

  -- ═══ Остаток — чем угодно ══════════════════════════════
  --
  -- Сюда доходит только команда, которой не хватило заданий
  -- нужного типа. Условия те же самые, снят один фильтр —
  -- по типу карточки.

  IF v_room > 0 THEN
    INSERT INTO public.team_hand (team_id, task_id)
    SELECT p_team_id, t.id
    FROM public.tasks t
    WHERE t.event_id = v_team.event_id
      AND t.active
      AND t.claimed_by_team_id IS NULL
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
    ORDER BY random()
    LIMIT v_room
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

COMMENT ON FUNCTION public.refill_team_hand IS
  'Снимает отыгравшие карточки и держит руку в шести: сначала по две каждого типа, затем остаток чем угодно, если тип в пуле кончился. Потолок в шесть соблюдается на каждом шаге, отказы обходятся, лок на команду не даёт параллельным запросам раздать лишнее. Проверке контента раздаётся весь пул.';
