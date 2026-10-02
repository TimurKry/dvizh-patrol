-- ─────────────────────────────────────────────────────────────
-- 0032 — Возврат в обычный режим стирает служебный след
--
-- Альфа задумывалась как режим для отдельных команд, которые
-- организатор удалит перед квестом. Удаление уносит всё каскадом,
-- и следа не остаётся.
--
-- Но пользоваться этим будут иначе: настоящим, уже
-- зарегистрированным командам включат альфу, дадут потрогать
-- шесть карточек, а пятого сентября вернут в обычный режим. Тут
-- прежняя схема протекает в двух местах сразу.
--
-- **Баллы.** Рейтинг отсекает служебные команды по флагу самой
-- команды, а не отправки: `leaderboard` фильтрует `NOT
-- ts.is_test`. Пока команда в альфе, её баллы не видны. Снимаем
-- флаг — и всё, что она набрала на тесте, всплывает в таблице
-- результатов. Команда выходит на старт с форой, которую никто
-- не заметит: транзакции лежат в журнале как настоящие.
--
-- **Попытки.** Число попыток считается по всем отправкам команды
-- на задание. Команда, дважды отправившая фотографию по заданию
-- №17 на тесте, приходит на квест с нулём попыток по нему. Если
-- №17 выпадет ей в руку, карточка сразу окажется в состоянии
-- «попытки кончились» — и никто не поймёт, почему.
--
-- Поэтому переход в `normal` из служебного режима удаляет
-- отправки, помеченные `is_test`, и начисления по ним. Ровно то
-- же самое, что даёт удаление команды, только команда остаётся:
-- имя, код, состав и согласия на месте.
--
-- Что намеренно не трогается:
--
-- - настоящие отправки и баллы команды, если они были до
--   включения альфы: у них `is_test = false`, под удаление они не
--   попадают;
-- - ручные начисления без отправки. Отличить «организатор
--   поправил счёт на тесте» от «организатор поправил счёт
--   по-настоящему» нечем — в транзакции нет ни флага, ни привязки
--   к режиму. Их организатор снимает руками, и в админке об этом
--   сказано;
-- - отказы от карточек: у альфы отказа нет вовсе, взяться им
--   неоткуда;
-- - файлы в хранилище. Строки отправок уходят, снимки остаются
--   лежать в бакете. На игру они не влияют.
-- ─────────────────────────────────────────────────────────────

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
  v_team    public.teams%ROWTYPE;
  v_wiped   integer := 0;
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

  -- Служебный след стирается только на выходе в обычный режим.
  -- Переход `alpha → preview` его сохраняет: команда осталась
  -- служебной, и её отправки по-прежнему помечены.
  IF p_access = 'normal' AND v_team.is_test THEN
    -- Начисления удаляются первыми и своим запросом: внешний
    -- ключ на отправку стоит с ON DELETE SET NULL, и удаление
    -- отправок оставило бы баллы в журнале — уже без следа,
    -- откуда они взялись.
    DELETE FROM public.score_transactions st
    USING public.submissions s
    WHERE st.submission_id = s.id
      AND s.team_id = p_team_id
      AND s.is_test;

    DELETE FROM public.submissions
    WHERE team_id = p_team_id AND is_test;

    GET DIAGNOSTICS v_wiped = ROW_COUNT;
  END IF;

  DELETE FROM public.team_hand WHERE team_id = p_team_id;
  PERFORM public.refill_team_hand(p_team_id);

  RETURN jsonb_build_object('ok', true, 'access', p_access, 'wipedSubmissions', v_wiped);
END
$$;

COMMENT ON FUNCTION public.set_team_access IS
  'Ставит команде режим доступа: normal, alpha или preview. Рука пересобирается под новый режим. Возврат в normal удаляет служебные отправки команды и начисления по ним, иначе тестовые баллы всплыли бы в рейтинге, а потраченные на тесте попытки — на квесте.';

REVOKE ALL ON FUNCTION public.set_team_access(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_access(uuid, text) TO service_role;
