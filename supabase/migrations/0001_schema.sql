-- ─────────────────────────────────────────────────────────────
-- 0001 — Перечисления и таблицы
--
-- Одно мероприятие = одна строка в events. Всё остальное
-- ссылается на event_id, поэтому новый квест заводится без
-- изменения схемы.
-- ─────────────────────────────────────────────────────────────

-- ═══ Перечисления ════════════════════════════════════════════

CREATE TYPE event_status AS ENUM (
  'draft',
  'registration',
  'live',
  'paused',
  'finished',
  'archived'
);

CREATE TYPE team_status AS ENUM (
  'pending',
  'confirmed',
  'cancelled'
);

CREATE TYPE submission_status AS ENUM (
  'draft',
  'uploading',
  'pending',
  'checking',
  'accepted',
  'manual_review',
  'rejected',
  'upload_failed',
  'cancelled'
);

CREATE TYPE validation_mode AS ENUM (
  'auto',
  'ai',
  'manual'
);

CREATE TYPE validation_job_status AS ENUM (
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE leaderboard_mode AS ENUM (
  'public',
  'team_position_only',
  'hidden',
  'frozen'
);

CREATE TYPE score_transaction_type AS ENUM (
  'task_accepted',
  'manual_adjustment',
  'bonus',
  'penalty',
  'submission_revoked'
);

-- ═══ Служебное ═══════════════════════════════════════════════

-- Единый триггер обновления updated_at.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- ═══ events ══════════════════════════════════════════════════

CREATE TABLE public.events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE,
  title                 text NOT NULL,
  subtitle              text,
  city                  text NOT NULL,
  timezone              text NOT NULL DEFAULT 'Europe/Berlin',
  starts_at             timestamptz NOT NULL,
  ends_at               timestamptz,
  status                event_status NOT NULL DEFAULT 'draft',
  price_cents           integer NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'EUR',
  max_teams             integer NOT NULL DEFAULT 10,
  team_size             integer NOT NULL DEFAULT 4,
  registration_open     boolean NOT NULL DEFAULT false,
  leaderboard_mode      leaderboard_mode NOT NULL DEFAULT 'public',
  ai_validation_enabled boolean NOT NULL DEFAULT true,
  ai_accept_threshold   numeric(4, 3) NOT NULL DEFAULT 0.88,
  photo_retention_days  integer,
  poster_path           text,
  -- Снимок рейтинга на момент заморозки (leaderboard_mode = 'frozen').
  leaderboard_frozen_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_max_teams_range CHECK (max_teams BETWEEN 1 AND 10),
  CONSTRAINT events_team_size_range CHECK (team_size BETWEEN 1 AND 4),
  CONSTRAINT events_price_non_negative CHECK (price_cents >= 0),
  CONSTRAINT events_threshold_range CHECK (ai_accept_threshold BETWEEN 0 AND 1),
  CONSTRAINT events_retention_positive CHECK (
    photo_retention_days IS NULL OR photo_retention_days > 0
  ),
  CONSTRAINT events_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  CONSTRAINT events_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT events_ends_after_starts CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TRIGGER events_set_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.events IS
  'Мероприятие. Приложение рассчитано на одно активное событие, но схема допускает несколько.';
COMMENT ON COLUMN public.events.ai_accept_threshold IS
  'Порог уверенности AI. Ниже него отправка уходит в ручную проверку.';

-- ═══ teams ═══════════════════════════════════════════════════

CREATE TABLE public.teams (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  name              text NOT NULL,
  join_code         text NOT NULL,
  captain_name      text NOT NULL,
  contact           text,
  status            team_status NOT NULL DEFAULT 'pending',
  payment_confirmed boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teams_name_not_blank CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT teams_captain_not_blank CHECK (length(btrim(captain_name)) BETWEEN 1 AND 60),
  CONSTRAINT teams_join_code_format CHECK (join_code ~ '^[A-Z0-9]{6}$'),
  CONSTRAINT teams_contact_length CHECK (contact IS NULL OR length(contact) <= 200)
);

-- Код приглашения уникален в пределах мероприятия.
CREATE UNIQUE INDEX teams_event_join_code_key
  ON public.teams (event_id, join_code);

-- Названия команд не должны отличаться только регистром.
CREATE UNIQUE INDEX teams_event_name_ci_key
  ON public.teams (event_id, lower(btrim(name)))
  WHERE status <> 'cancelled';

CREATE INDEX teams_event_status_idx ON public.teams (event_id, status);

CREATE TRIGGER teams_set_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.teams.join_code IS
  'Шестизначный код для входа участников. Уникален внутри мероприятия.';

-- ═══ team_members ════════════════════════════════════════════

CREATE TABLE public.team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_captain boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_members_name_not_blank CHECK (length(btrim(name)) BETWEEN 1 AND 60)
);

CREATE INDEX team_members_team_idx ON public.team_members (team_id);

-- В команде ровно один капитан.
CREATE UNIQUE INDEX team_members_single_captain_key
  ON public.team_members (team_id)
  WHERE is_captain;

-- Участники внутри команды различаются по имени.
CREATE UNIQUE INDEX team_members_name_ci_key
  ON public.team_members (team_id, lower(btrim(name)));

-- ═══ team_sessions ═══════════════════════════════════════════

CREATE TABLE public.team_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  member_id    uuid REFERENCES public.team_members (id) ON DELETE SET NULL,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text,

  CONSTRAINT team_sessions_token_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX team_sessions_team_idx ON public.team_sessions (team_id);
CREATE INDEX team_sessions_expiry_idx ON public.team_sessions (expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.team_sessions IS
  'Сессии команд. Хранится только SHA-256 от токена, сам токен живёт в httpOnly cookie.';

-- ═══ tasks ═══════════════════════════════════════════════════

CREATE TABLE public.tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  number            integer NOT NULL,
  title             text NOT NULL,
  short_description text,
  description       text NOT NULL,
  points            integer NOT NULL,
  category          text NOT NULL,
  difficulty        text NOT NULL DEFAULT 'medium',
  validation_mode   validation_mode NOT NULL DEFAULT 'manual',
  criteria          jsonb NOT NULL DEFAULT '[]'::jsonb,
  minimum_people    integer NOT NULL DEFAULT 0,
  max_attempts      integer NOT NULL DEFAULT 2,
  require_location  boolean NOT NULL DEFAULT false,
  latitude          double precision,
  longitude         double precision,
  radius_meters     integer,
  active            boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  available_from    timestamptz,
  available_until   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tasks_number_positive CHECK (number > 0),
  CONSTRAINT tasks_title_not_blank CHECK (length(btrim(title)) BETWEEN 1 AND 140),
  CONSTRAINT tasks_description_not_blank CHECK (length(btrim(description)) > 0),
  CONSTRAINT tasks_points_non_negative CHECK (points >= 0),
  CONSTRAINT tasks_minimum_people_non_negative CHECK (minimum_people >= 0),
  CONSTRAINT tasks_max_attempts_positive CHECK (max_attempts >= 1),
  CONSTRAINT tasks_criteria_is_array CHECK (jsonb_typeof(criteria) = 'array'),
  CONSTRAINT tasks_category_known CHECK (
    category IN (
      'monuments', 'road_signs', 'advertising', 'interaction',
      'object_search', 'team', 'creative', 'special'
    )
  ),
  CONSTRAINT tasks_difficulty_known CHECK (
    difficulty IN ('easy', 'medium', 'hard')
  ),
  CONSTRAINT tasks_latitude_range CHECK (
    latitude IS NULL OR latitude BETWEEN -90 AND 90
  ),
  CONSTRAINT tasks_longitude_range CHECK (
    longitude IS NULL OR longitude BETWEEN -180 AND 180
  ),
  -- Требуешь геолокацию — задай точку и радиус.
  CONSTRAINT tasks_location_complete CHECK (
    NOT require_location
    OR (latitude IS NOT NULL AND longitude IS NOT NULL AND radius_meters IS NOT NULL)
  ),
  CONSTRAINT tasks_radius_positive CHECK (
    radius_meters IS NULL OR radius_meters BETWEEN 10 AND 20000
  ),
  CONSTRAINT tasks_window_ordered CHECK (
    available_from IS NULL OR available_until IS NULL OR available_until > available_from
  ),
  -- AI-проверке нужны критерии, иначе ей нечего проверять.
  CONSTRAINT tasks_ai_needs_criteria CHECK (
    validation_mode <> 'ai' OR jsonb_array_length(criteria) > 0
  )
);

CREATE UNIQUE INDEX tasks_event_number_key ON public.tasks (event_id, number);
CREATE INDEX tasks_event_active_idx ON public.tasks (event_id, active, sort_order);
CREATE INDEX tasks_event_category_idx ON public.tasks (event_id, category);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.tasks.criteria IS
  'JSON-массив строк. Передаётся в AI как список проверяемых утверждений.';

-- ═══ task_reference_images ═══════════════════════════════════

CREATE TABLE public.task_reference_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  image_path text NOT NULL,
  caption    text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT task_reference_images_path_not_blank CHECK (length(btrim(image_path)) > 0)
);

CREATE INDEX task_reference_images_task_idx
  ON public.task_reference_images (task_id, sort_order);

-- ═══ submissions ═════════════════════════════════════════════

CREATE TABLE public.submissions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id               uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  team_id                uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  task_id                uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  member_id              uuid REFERENCES public.team_members (id) ON DELETE SET NULL,
  image_path             text,
  preview_path           text,
  status                 submission_status NOT NULL DEFAULT 'pending',
  attempt_number         integer NOT NULL DEFAULT 1,
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  -- Ключ идемпотентности приходит с клиента и защищает от повторной
  -- отправки при обрыве связи. Уникален в пределах команды и задания.
  idempotency_key        text,
  bytes                  integer,
  mime_type              text,
  latitude               double precision,
  longitude              double precision,
  location_accuracy      double precision,
  perceptual_hash        text,
  duplicate_submission_id uuid REFERENCES public.submissions (id) ON DELETE SET NULL,
  duplicate_similarity   numeric(5, 4),
  ai_confidence          numeric(5, 4),
  ai_result              jsonb,
  review_reason          text,
  awarded_points         integer NOT NULL DEFAULT 0,
  reviewed_by            uuid,
  reviewed_at            timestamptz,
  admin_comment          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT submissions_attempt_positive CHECK (attempt_number >= 1),
  CONSTRAINT submissions_awarded_non_negative CHECK (awarded_points >= 0),
  CONSTRAINT submissions_confidence_range CHECK (
    ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1
  ),
  CONSTRAINT submissions_similarity_range CHECK (
    duplicate_similarity IS NULL OR duplicate_similarity BETWEEN 0 AND 1
  ),
  CONSTRAINT submissions_latitude_range CHECK (
    latitude IS NULL OR latitude BETWEEN -90 AND 90
  ),
  CONSTRAINT submissions_longitude_range CHECK (
    longitude IS NULL OR longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT submissions_phash_format CHECK (
    perceptual_hash IS NULL OR perceptual_hash ~ '^[a-f0-9]{16}$'
  ),
  CONSTRAINT submissions_not_own_duplicate CHECK (duplicate_submission_id <> id),
  -- Принятая отправка обязана иметь файл.
  CONSTRAINT submissions_accepted_has_image CHECK (
    status <> 'accepted' OR image_path IS NOT NULL
  )
);

-- Одно задание засчитывается команде один раз.
CREATE UNIQUE INDEX submissions_one_accepted_per_task_key
  ON public.submissions (team_id, task_id)
  WHERE status = 'accepted';

-- Повторный запрос с тем же ключом не создаёт вторую отправку.
CREATE UNIQUE INDEX submissions_idempotency_key
  ON public.submissions (team_id, task_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX submissions_event_status_idx ON public.submissions (event_id, status);
CREATE INDEX submissions_team_task_idx ON public.submissions (team_id, task_id);
CREATE INDEX submissions_task_idx ON public.submissions (task_id);
CREATE INDEX submissions_queue_idx ON public.submissions (event_id, status, submitted_at DESC);
CREATE INDEX submissions_phash_idx ON public.submissions (event_id, perceptual_hash)
  WHERE perceptual_hash IS NOT NULL;

CREATE TRIGGER submissions_set_updated_at
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.submissions.review_reason IS
  'Почему отправка попала в ручную проверку: possible_duplicate, ai_low_confidence, ai_unavailable, ai_invalid_response, ai_error, manual_mode, criterion_failed.';

-- ═══ validation_jobs ═════════════════════════════════════════

CREATE TABLE public.validation_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.submissions (id) ON DELETE CASCADE,
  status        validation_job_status NOT NULL DEFAULT 'queued',
  attempts      integer NOT NULL DEFAULT 0,
  available_at  timestamptz NOT NULL DEFAULT now(),
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT validation_jobs_attempts_non_negative CHECK (attempts >= 0)
);

-- Индекс под выборку очереди: queued + пришло время.
CREATE INDEX validation_jobs_ready_idx
  ON public.validation_jobs (available_at)
  WHERE status = 'queued';

CREATE INDEX validation_jobs_stale_idx
  ON public.validation_jobs (locked_at)
  WHERE status = 'processing';

CREATE TRIGGER validation_jobs_set_updated_at
  BEFORE UPDATE ON public.validation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══ score_transactions ══════════════════════════════════════

CREATE TABLE public.score_transactions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                  uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  team_id                   uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  submission_id             uuid REFERENCES public.submissions (id) ON DELETE SET NULL,
  points                    integer NOT NULL,
  transaction_type          score_transaction_type NOT NULL,
  reason                    text,
  created_by                uuid,
  reverses_transaction_id   uuid REFERENCES public.score_transactions (id) ON DELETE SET NULL,
  reversed_by_transaction_id uuid REFERENCES public.score_transactions (id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT score_transactions_no_self_reference CHECK (
    reverses_transaction_id <> id AND reversed_by_transaction_id <> id
  )
);

-- Ключевая гарантия: у отправки не может быть двух ДЕЙСТВУЮЩИХ
-- начислений. После отмены (reversed_by_transaction_id заполнен)
-- отправку можно принять заново.
CREATE UNIQUE INDEX score_transactions_one_active_accept_key
  ON public.score_transactions (submission_id)
  WHERE transaction_type = 'task_accepted' AND reversed_by_transaction_id IS NULL;

CREATE INDEX score_transactions_team_idx ON public.score_transactions (team_id);
CREATE INDEX score_transactions_event_idx ON public.score_transactions (event_id, created_at DESC);

COMMENT ON TABLE public.score_transactions IS
  'Журнал начислений — единственный источник истины по баллам. teams.total_score не существует намеренно.';

-- ═══ consents ════════════════════════════════════════════════

CREATE TABLE public.consents (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                    uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  member_id                  uuid REFERENCES public.team_members (id) ON DELETE SET NULL,
  member_name                text NOT NULL,
  participation_consent      boolean NOT NULL DEFAULT false,
  photo_processing_consent   boolean NOT NULL DEFAULT false,
  social_publication_consent boolean NOT NULL DEFAULT false,
  policy_version             text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),

  -- Участие невозможно без согласия на участие и на обработку фото.
  -- Публикация в соцсетях — отдельный и необязательный выбор.
  CONSTRAINT consents_required_given CHECK (
    participation_consent AND photo_processing_consent
  )
);

CREATE INDEX consents_team_idx ON public.consents (team_id);

-- ═══ admin_users ═════════════════════════════════════════════

-- Список администраторов. Связывает аккаунт Supabase Auth с ролью.
-- Проверяется на сервере и в политиках RLS.
CREATE TABLE public.admin_users (
  user_id    uuid PRIMARY KEY,
  email      text NOT NULL UNIQUE,
  name       text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_users_email_format CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);

COMMENT ON TABLE public.admin_users IS
  'Кто является администратором. Заполняется скриптом scripts/create-admin.mjs.';

-- ═══ admin_audit_log ═════════════════════════════════════════

CREATE TABLE public.admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid,
  admin_email text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_audit_log_action_not_blank CHECK (length(btrim(action)) > 0)
);

CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_entity_idx ON public.admin_audit_log (entity_type, entity_id);

-- ═══ rate_limits ═════════════════════════════════════════════

-- Счётчики фиксированного окна. Redis для 40 участников не нужен.
CREATE TABLE public.rate_limits (
  bucket      text NOT NULL,
  window_start timestamptz NOT NULL,
  hits        integer NOT NULL DEFAULT 0,

  PRIMARY KEY (bucket, window_start),
  CONSTRAINT rate_limits_hits_positive CHECK (hits >= 0)
);

CREATE INDEX rate_limits_window_idx ON public.rate_limits (window_start);
