-- ═══════════════════════════════════════════════════════════════
-- 0019 · Свой размер у команды и настоящее удаление
--
-- Две дыры, найденные организатором на живой подготовке.
--
-- **Размер команды был общий на всё мероприятие.** А по факту одна
-- компания приходит вшестером, остальные вчетвером-впятером.
-- Ставить всем шесть — значит разрешить любой команде добрать
-- лишних; ставить четыре — не пустить тех, кого позвали. Теперь у
-- команды может быть свой потолок, а число в настройках
-- мероприятия остаётся значением по умолчанию.
--
-- **Команду нельзя было удалить.** Только «отменить регистрацию»:
-- место освобождается, но строка остаётся, и обкатанные тестовые
-- команды продолжают висеть в списке перед настоящими людьми.
-- Отмена — правильное действие во время игры, но не тогда, когда
-- мероприятие ещё готовится.
--
-- Поэтому удаление разрешено только до старта. После него команда
-- уже в журнале баллов и в чужих результатах: стирать её значило
-- бы менять историю задним числом, и правильный ответ там —
-- отмена.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS size_limit smallint;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_size_limit_range;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_size_limit_range CHECK (
    size_limit IS NULL OR size_limit BETWEEN 1 AND 6
  );

COMMENT ON COLUMN public.teams.size_limit IS
  'Свой потолок участников. NULL — берётся events.team_size.';

-- ═══ Вход по коду сверяется со «своим» потолком ══════════════

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

  IF v_event.status NOT IN ('registration', 'live', 'paused') THEN
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

-- ═══ Удаление команды ════════════════════════════════════════

/**
 * Убрать команду насовсем.
 *
 * Каскады уносят участников, сессии, согласия, отправки, баллы и
 * руку — все внешние ключи на `teams` объявлены с `ON DELETE
 * CASCADE` ещё в `0001`.
 *
 * А вот захваченные задания надо освободить руками, и это здесь
 * главное. Колонка `claimed_by_team_id` объявлена с `ON DELETE SET
 * NULL`, но захват — тройка колонок с проверкой «или всё, или
 * ничего»: обнулив одну, Postgres упёрся бы в собственное
 * ограничение и удаление бы не прошло. Хуже того, без этого шага
 * задание ушло бы из игры вместе с удалённой командой.
 *
 * Пути к файлам возвращаются наружу: строки в базе исчезнут, а
 * снимки в Storage остались бы мусором.
 */
CREATE OR REPLACE FUNCTION public.delete_team(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team      public.teams%ROWTYPE;
  v_event     public.events%ROWTYPE;
  v_images    text[];
  v_previews  text[];
  v_members   integer;
  v_subs      integer;
  v_released  integer;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_team.event_id;

  -- После старта команда уже в чужих результатах: её баллы влияли
  -- на гонку за задания. Стирать такое — переписывать историю.
  IF v_event.status NOT IN ('draft', 'registration') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'event_started',
      'status', v_event.status
    );
  END IF;

  SELECT
    coalesce(array_agg(image_path)   FILTER (WHERE image_path   IS NOT NULL), '{}'),
    coalesce(array_agg(preview_path) FILTER (WHERE preview_path IS NOT NULL), '{}'),
    count(*)
  INTO v_images, v_previews, v_subs
  FROM public.submissions
  WHERE team_id = p_team_id;

  SELECT count(*) INTO v_members FROM public.team_members WHERE team_id = p_team_id;

  UPDATE public.tasks
  SET claimed_by_team_id    = NULL,
      claimed_submission_id = NULL,
      claimed_at            = NULL
  WHERE claimed_by_team_id = p_team_id;

  GET DIAGNOSTICS v_released = ROW_COUNT;

  DELETE FROM public.teams WHERE id = p_team_id;

  RETURN jsonb_build_object(
    'ok', true,
    'teamName', v_team.name,
    'members', v_members,
    'submissions', v_subs,
    'releasedTasks', v_released,
    'imagePaths', to_jsonb(v_images),
    'previewPaths', to_jsonb(v_previews)
  );
END
$$;

-- Удаление команды доступно только серверу с ключом службы.
REVOKE ALL ON FUNCTION public.delete_team(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_team(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_team IS
  'Убирает команду со всем следом и возвращает захваченные задания в пул. Только до старта.';
