-- ─────────────────────────────────────────────────────────────
-- 0035 — Студия: заявки (CRM)
--
-- Заявки с лендинга dvizh-events-os и из Telegram живут в той же
-- базе, что и игра: воронка → проект → событие строятся поверх
-- одних и тех же таблиц, а бесплатный тариф Supabase не держит
-- больше двух проектов.
--
-- Колонки повторяют таблицу leads лендинга один в один: сайт
-- переключается на эту базу сменой двух переменных окружения,
-- без правки кода.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
  'won',
  'lost'
);

CREATE TYPE lead_source AS ENUM (
  'site',
  'telegram',
  'manual'
);

-- ═══ leads ═══════════════════════════════════════════════════

CREATE TABLE public.leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  source             lead_source NOT NULL DEFAULT 'site',
  name               text NOT NULL,
  email              text,
  messenger          text,
  -- Сайт заполняет всё ниже; заявке из переписки в Telegram
  -- город или игра могут быть ещё неизвестны.
  city               text,
  scenario           text,
  participants_range text,
  ticket_price_range text,
  event_date         date,
  notes              text,
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  status             lead_status NOT NULL DEFAULT 'new',
  status_changed_at  timestamptz NOT NULL DEFAULT now(),
  assignee_id        uuid REFERENCES public.admin_users (user_id) ON DELETE SET NULL,
  lost_reason        text,

  CONSTRAINT leads_name_not_blank CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT leads_contact_present CHECK (email IS NOT NULL OR messenger IS NOT NULL),
  CONSTRAINT leads_email_length CHECK (email IS NULL OR length(email) <= 200),
  CONSTRAINT leads_messenger_length CHECK (messenger IS NULL OR length(messenger) <= 120),
  CONSTRAINT leads_city_length CHECK (city IS NULL OR length(city) <= 120),
  CONSTRAINT leads_notes_length CHECK (notes IS NULL OR length(notes) <= 4000),
  CONSTRAINT leads_lost_reason_length CHECK (lost_reason IS NULL OR length(lost_reason) <= 500)
);

CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX leads_status_idx ON public.leads (status, created_at DESC);
CREATE INDEX leads_assignee_idx ON public.leads (assignee_id) WHERE assignee_id IS NOT NULL;

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.leads IS
  'Заявки на проведение игр: бриф с сайта, переписка в Telegram, ручной ввод.';

-- ═══ lead_activities ═════════════════════════════════════════

-- Лента по заявке: заметки, смена статуса, смена ответственного.
-- Как и журнал баллов, только дописывается — история разговора с
-- клиентом должна читаться через полгода.
CREATE TABLE public.lead_activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  kind         text NOT NULL,
  body         text,
  from_status  lead_status,
  to_status    lead_status,
  author_id    uuid,
  author_email text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_activities_kind_known CHECK (kind IN ('note', 'status', 'assignee', 'created')),
  CONSTRAINT lead_activities_body_length CHECK (body IS NULL OR length(body) <= 4000),
  CONSTRAINT lead_activities_note_has_body CHECK (
    kind <> 'note' OR length(btrim(coalesce(body, ''))) > 0
  ),
  CONSTRAINT lead_activities_status_complete CHECK (
    kind <> 'status' OR to_status IS NOT NULL
  )
);

CREATE INDEX lead_activities_lead_idx ON public.lead_activities (lead_id, created_at DESC);

-- ═══ Доступ ══════════════════════════════════════════════════

ALTER TABLE public.leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- Сайт пишет публичным ключом. Ему можно только оставить новую
-- заявку — ни прочитать, ни изменить, ни назначить ответственного.
CREATE POLICY leads_site_insert ON public.leads
  FOR INSERT TO anon
  WITH CHECK (status = 'new' AND source = 'site' AND assignee_id IS NULL AND lost_reason IS NULL);

GRANT INSERT ON public.leads TO anon;

CREATE POLICY leads_admin_all ON public.leads
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

CREATE POLICY lead_activities_admin_all ON public.lead_activities
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT ON public.lead_activities TO authenticated;
