-- ─────────────────────────────────────────────────────────────
-- 0004 — Row Level Security
--
-- Модель доступа:
--
--   service_role  — сервер приложения. Обходит RLS, вся бизнес-
--                   логика и запись идут только отсюда.
--   authenticated — администратор (Supabase Auth) и, если
--                   настроен SUPABASE_JWT_SECRET, команда с
--                   claim team_id для Realtime.
--   anon          — посетитель. Видит только опубликованное
--                   мероприятие, задания идущего квеста и
--                   публичный рейтинг.
--
-- Участники НИКОГДА не пишут в базу напрямую: у них нет ни одной
-- политики INSERT/UPDATE/DELETE. Запись выполняет сервер после
-- проверки командной сессии из httpOnly cookie.
-- ─────────────────────────────────────────────────────────────

-- ═══ Помощники ═══════════════════════════════════════════════

-- Команда, от имени которой пришёл запрос. Значение берётся из
-- подписанного JWT, а не из параметра запроса, поэтому подделать
-- его нельзя, не зная секрет проекта.
CREATE OR REPLACE FUNCTION public.current_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(auth.jwt() ->> 'team_id', '')::uuid;
$$;

-- Владелец таблицы обходит RLS, поэтому обращение к admin_users
-- изнутри SECURITY DEFINER не зацикливается на собственной политике.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()
  );
$$;

-- Задания видны только когда квест идёт или уже закончился.
-- На этапе регистрации список закрыт (см. раздел 14 ТЗ).
CREATE OR REPLACE FUNCTION public.event_tasks_visible(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND e.status IN ('live', 'paused', 'finished')
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_team_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_tasks_visible(uuid) TO anon, authenticated, service_role;

-- ═══ Снимаем права по умолчанию ══════════════════════════════

-- Supabase выдаёт anon и authenticated полный доступ к новым
-- таблицам в public. Забираем всё и раздаём точечно.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ═══ Включаем RLS ════════════════════════════════════════════

ALTER TABLE public.events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reference_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- ═══ events ══════════════════════════════════════════════════

-- Черновик мероприятия наружу не показываем.
CREATE POLICY events_read_published ON public.events
  FOR SELECT TO anon, authenticated
  USING (status <> 'draft');

CREATE POLICY events_admin_all ON public.events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated;

-- ═══ tasks ═══════════════════════════════════════════════════

CREATE POLICY tasks_read_active ON public.tasks
  FOR SELECT TO anon, authenticated
  USING (active AND public.event_tasks_visible(event_id));

CREATE POLICY tasks_admin_all ON public.tasks
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.tasks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tasks TO authenticated;

-- ═══ task_reference_images ═══════════════════════════════════

CREATE POLICY task_reference_images_read ON public.task_reference_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND t.active
        AND public.event_tasks_visible(t.event_id)
    )
  );

CREATE POLICY task_reference_images_admin_all ON public.task_reference_images
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.task_reference_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.task_reference_images TO authenticated;

-- ═══ teams ═══════════════════════════════════════════════════

-- Команда видит только себя. Контакты и коды других команд
-- недоступны никому, кроме организатора.
CREATE POLICY teams_read_own ON public.teams
  FOR SELECT TO authenticated
  USING (id = public.current_team_id() OR public.is_admin());

CREATE POLICY teams_admin_write ON public.teams
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.teams TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.teams TO authenticated;

-- ═══ team_members ════════════════════════════════════════════

CREATE POLICY team_members_read_own ON public.team_members
  FOR SELECT TO authenticated
  USING (team_id = public.current_team_id() OR public.is_admin());

CREATE POLICY team_members_admin_write ON public.team_members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.team_members TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.team_members TO authenticated;

-- ═══ team_sessions ═══════════════════════════════════════════

-- Ни одной политики: таблица доступна только service_role.
-- Хэши сессий не должны покидать сервер даже для администратора.

-- ═══ submissions ═════════════════════════════════════════════

-- Команда читает свои отправки. Чужие фотографии не видны:
-- ни строка, ни путь в Storage.
CREATE POLICY submissions_read_own ON public.submissions
  FOR SELECT TO authenticated
  USING (team_id = public.current_team_id() OR public.is_admin());

CREATE POLICY submissions_admin_write ON public.submissions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.submissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.submissions TO authenticated;

-- ═══ score_transactions ══════════════════════════════════════

CREATE POLICY score_transactions_read_own ON public.score_transactions
  FOR SELECT TO authenticated
  USING (team_id = public.current_team_id() OR public.is_admin());

CREATE POLICY score_transactions_admin_write ON public.score_transactions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.score_transactions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.score_transactions TO authenticated;

-- ═══ validation_jobs ═════════════════════════════════════════

CREATE POLICY validation_jobs_admin_all ON public.validation_jobs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_jobs TO authenticated;

-- ═══ consents ════════════════════════════════════════════════

CREATE POLICY consents_admin_all ON public.consents
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consents TO authenticated;

-- ═══ admin_users ═════════════════════════════════════════════

CREATE POLICY admin_users_read_self ON public.admin_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

GRANT SELECT ON public.admin_users TO authenticated;

-- ═══ admin_audit_log ═════════════════════════════════════════

CREATE POLICY admin_audit_log_read ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.admin_audit_log TO authenticated;

-- ═══ leaderboard_snapshots ═══════════════════════════════════

-- Замороженный рейтинг показывается всем, если режим это допускает.
CREATE POLICY leaderboard_snapshots_read ON public.leaderboard_snapshots
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND e.leaderboard_mode = 'frozen'
        AND e.status IN ('live', 'paused', 'finished')
    )
  );

CREATE POLICY leaderboard_snapshots_admin ON public.leaderboard_snapshots
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.leaderboard_snapshots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.leaderboard_snapshots TO authenticated;

-- ═══ rate_limits ═════════════════════════════════════════════

-- Ни одной политики: только service_role.
