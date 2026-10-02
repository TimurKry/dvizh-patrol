-- ─────────────────────────────────────────────────────────────
-- 0036 — Студия: команда и роли
--
-- admin_users становится списком сотрудников. Таблицу не
-- переименовываем: на неё опираются RLS игры, журнал и скрипт
-- создания администратора, а смысл «кто может войти» не меняется.
--
--   owner   — владелец: всё, включая состав команды;
--   manager — менеджер: заявки, проекты и игра;
--   host    — ведущий: только игра (проверка фото, команды, рейтинг).
--
-- Уволить = выставить disabled_at. Строка остаётся: на неё
-- ссылаются заявки (ответственный) и журнал действий.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE staff_role AS ENUM ('owner', 'manager', 'host');

ALTER TABLE public.admin_users
  ADD COLUMN role        staff_role NOT NULL DEFAULT 'manager',
  ADD COLUMN disabled_at timestamptz,
  ADD COLUMN invited_by  uuid;

-- Все, кто был администратором до появления ролей, — владельцы:
-- сегодня это ровно один человек, и урезать ему права нельзя.
UPDATE public.admin_users SET role = 'owner';

COMMENT ON COLUMN public.admin_users.role IS
  'owner — всё; manager — заявки, проекты, игра; host — только игра.';
COMMENT ON COLUMN public.admin_users.disabled_at IS
  'Доступ закрыт. Строка не удаляется: на неё ссылаются заявки и журнал.';

-- Отключённый сотрудник перестаёт быть администратором везде,
-- где RLS игры спрашивает is_admin().
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = auth.uid() AND a.disabled_at IS NULL
  );
$$;

-- Заявки видят владелец и менеджеры, ведущему они ни к чему.
CREATE OR REPLACE FUNCTION public.is_crm_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = auth.uid()
      AND a.disabled_at IS NULL
      AND a.role IN ('owner', 'manager')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_crm_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_crm_staff() TO authenticated, service_role;

DROP POLICY leads_admin_all ON public.leads;
CREATE POLICY leads_crm_all ON public.leads
  FOR ALL TO authenticated
  USING (public.is_crm_staff())
  WITH CHECK (public.is_crm_staff());

DROP POLICY lead_activities_admin_all ON public.lead_activities;
CREATE POLICY lead_activities_crm_all ON public.lead_activities
  FOR ALL TO authenticated
  USING (public.is_crm_staff())
  WITH CHECK (public.is_crm_staff());

-- Владелец в системе всегда есть: нельзя ни отключить, ни понизить
-- последнего. Проверка в базе, а не только в интерфейсе — иначе
-- две одновременные правки в двух вкладках оставили бы студию
-- без хозяина.
CREATE OR REPLACE FUNCTION public.admin_users_keep_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.role = 'owner' AND OLD.disabled_at IS NULL
     AND (NEW.role <> 'owner' OR NEW.disabled_at IS NOT NULL) THEN
    PERFORM 1 FROM public.admin_users WHERE role = 'owner' FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE role = 'owner' AND disabled_at IS NULL AND user_id <> OLD.user_id
    ) THEN
      RAISE EXCEPTION 'last_owner' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER admin_users_keep_owner
  BEFORE UPDATE OF role, disabled_at ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.admin_users_keep_owner();
