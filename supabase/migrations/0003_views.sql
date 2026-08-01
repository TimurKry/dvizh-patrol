-- ─────────────────────────────────────────────────────────────
-- 0003 — Представления и рейтинг
--
-- Баллы нигде не денормализованы. Любая цифра в интерфейсе —
-- это агрегат по score_transactions, посчитанный на лету.
-- На 10 командах и 500 отправках это дешевле, чем поддерживать
-- согласованность счётчика.
-- ─────────────────────────────────────────────────────────────

-- ═══ Снимки рейтинга ═════════════════════════════════════════

-- Режим leaderboard_mode = 'frozen' показывает сохранённое
-- состояние. Без снимка «заморозка» была бы просто запретом
-- на показ, а организатору нужно именно зафиксировать таблицу
-- (например, за час до финиша).
CREATE TABLE public.leaderboard_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  position       integer NOT NULL,
  team_id        uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  team_name      text NOT NULL,
  total_points   integer NOT NULL,
  accepted_count integer NOT NULL,
  frozen_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leaderboard_snapshots_event_idx
  ON public.leaderboard_snapshots (event_id, position);

-- ═══ Баллы команд ════════════════════════════════════════════

CREATE VIEW public.team_scores
WITH (security_invoker = true) AS
SELECT
  t.id                                        AS team_id,
  t.event_id,
  t.name                                      AS team_name,
  t.status                                    AS team_status,
  COALESCE(sum(st.points), 0)::integer        AS total_points,
  COALESCE(
    count(*) FILTER (
      WHERE st.transaction_type = 'task_accepted'
        AND st.reversed_by_transaction_id IS NULL
    ),
    0
  )::integer                                  AS accepted_count,
  max(st.created_at) FILTER (
    WHERE st.transaction_type = 'task_accepted'
      AND st.reversed_by_transaction_id IS NULL
  )                                           AS last_accepted_at
FROM public.teams t
LEFT JOIN public.score_transactions st ON st.team_id = t.id
GROUP BY t.id, t.event_id, t.name, t.status;

COMMENT ON VIEW public.team_scores IS
  'Баллы команды как сумма журнала. Отменённые начисления гасятся обратной транзакцией, поэтому в сумму входят обе строки.';

-- ═══ Рейтинг ═════════════════════════════════════════════════

CREATE VIEW public.leaderboard
WITH (security_invoker = true) AS
SELECT
  ts.event_id,
  ts.team_id,
  ts.team_name,
  ts.total_points,
  ts.accepted_count,
  ts.last_accepted_at,
  row_number() OVER w AS position,
  rank()       OVER w AS rank
FROM public.team_scores ts
WHERE ts.team_status <> 'cancelled'
WINDOW w AS (
  PARTITION BY ts.event_id
  ORDER BY ts.total_points DESC,
           ts.accepted_count DESC,
           ts.last_accepted_at ASC NULLS LAST
);

-- Публичная витрина рейтинга.
--
-- Намеренно НЕ security_invoker: представление обходит RLS
-- нижележащих таблиц, поэтому здесь нет ни контактов, ни кодов
-- приглашения — только то, что и так висит на экране у всех.
-- Строки отдаются лишь при leaderboard_mode = 'public'.
CREATE VIEW public.leaderboard_public AS
SELECT
  l.event_id,
  l.team_id,
  l.team_name,
  l.total_points,
  l.accepted_count,
  l.position,
  l.rank
FROM public.leaderboard l
JOIN public.events e ON e.id = l.event_id
WHERE e.leaderboard_mode = 'public'
  AND e.status IN ('live', 'paused', 'finished');

COMMENT ON VIEW public.leaderboard_public IS
  'Только публичные колонки и только при leaderboard_mode = public. Безопасно отдавать анониму.';

-- ═══ Прогресс команды ════════════════════════════════════════

CREATE VIEW public.team_progress
WITH (security_invoker = true) AS
SELECT
  t.id       AS team_id,
  t.event_id,
  (
    SELECT count(*)::integer FROM public.tasks tk
    WHERE tk.event_id = t.event_id AND tk.active
  )          AS tasks_total,
  count(*) FILTER (WHERE s.status = 'accepted')::integer      AS accepted,
  count(*) FILTER (WHERE s.status = 'pending')::integer       AS pending,
  count(*) FILTER (WHERE s.status = 'checking')::integer      AS checking,
  count(*) FILTER (WHERE s.status = 'manual_review')::integer AS manual_review,
  count(*) FILTER (WHERE s.status = 'rejected')::integer      AS rejected,
  count(*) FILTER (
    WHERE s.status IN ('pending', 'checking', 'manual_review')
  )::integer AS in_review,
  count(DISTINCT s.task_id) FILTER (
    WHERE s.status IN ('pending', 'checking', 'accepted', 'manual_review')
  )::integer AS tasks_touched
FROM public.teams t
LEFT JOIN public.submissions s ON s.team_id = t.id
GROUP BY t.id, t.event_id;

-- ═══ Сводка для админки ══════════════════════════════════════

CREATE VIEW public.admin_dashboard
WITH (security_invoker = true) AS
SELECT
  e.id AS event_id,
  e.status,
  e.registration_open,
  e.max_teams,
  e.team_size,
  e.leaderboard_mode,
  e.ai_validation_enabled,
  (
    SELECT count(*)::integer FROM public.teams t
    WHERE t.event_id = e.id AND t.status <> 'cancelled'
  ) AS teams_active,
  (
    SELECT count(*)::integer FROM public.teams t
    WHERE t.event_id = e.id AND t.status = 'confirmed'
  ) AS teams_confirmed,
  (
    SELECT count(*)::integer FROM public.teams t
    WHERE t.event_id = e.id AND t.status = 'pending'
  ) AS teams_pending,
  (
    SELECT count(*)::integer FROM public.team_members m
    JOIN public.teams t ON t.id = m.team_id
    WHERE t.event_id = e.id AND t.status <> 'cancelled'
  ) AS members_total,
  (
    SELECT count(*)::integer FROM public.tasks tk
    WHERE tk.event_id = e.id AND tk.active
  ) AS tasks_active,
  (
    SELECT count(*)::integer FROM public.submissions s
    WHERE s.event_id = e.id
      AND s.status NOT IN ('draft', 'uploading', 'upload_failed', 'cancelled')
  ) AS submissions_total,
  (
    SELECT count(*)::integer FROM public.submissions s
    WHERE s.event_id = e.id AND s.status = 'pending'
  ) AS submissions_pending,
  (
    SELECT count(*)::integer FROM public.submissions s
    WHERE s.event_id = e.id AND s.status = 'checking'
  ) AS submissions_checking,
  (
    SELECT count(*)::integer FROM public.submissions s
    WHERE s.event_id = e.id AND s.status = 'accepted'
  ) AS submissions_accepted,
  (
    SELECT count(*)::integer FROM public.submissions s
    WHERE s.event_id = e.id AND s.status = 'manual_review'
  ) AS submissions_manual_review,
  (
    SELECT count(*)::integer FROM public.submissions s
    WHERE s.event_id = e.id AND s.status = 'rejected'
  ) AS submissions_rejected,
  (
    SELECT count(*)::integer FROM public.submissions s
    WHERE s.event_id = e.id AND s.duplicate_submission_id IS NOT NULL
  ) AS possible_duplicates,
  (
    SELECT count(*)::integer FROM public.validation_jobs j
    JOIN public.submissions s ON s.id = j.submission_id
    WHERE s.event_id = e.id AND j.status = 'failed'
  ) AS ai_failed_jobs,
  (
    SELECT count(*)::integer FROM public.validation_jobs j
    JOIN public.submissions s ON s.id = j.submission_id
    WHERE s.event_id = e.id AND j.status = 'queued'
  ) AS ai_queued_jobs
FROM public.events e;

-- ═══ Заморозка рейтинга ══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.freeze_leaderboard(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.leaderboard_snapshots WHERE event_id = p_event_id;

  INSERT INTO public.leaderboard_snapshots (
    event_id, position, team_id, team_name, total_points, accepted_count
  )
  SELECT l.event_id, l.position, l.team_id, l.team_name, l.total_points, l.accepted_count
  FROM public.leaderboard l
  WHERE l.event_id = p_event_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE public.events
  SET leaderboard_mode = 'frozen', leaderboard_frozen_at = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END
$$;

CREATE OR REPLACE FUNCTION public.unfreeze_leaderboard(
  p_event_id uuid,
  p_mode     public.leaderboard_mode DEFAULT 'public'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_mode = 'frozen' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode');
  END IF;

  DELETE FROM public.leaderboard_snapshots WHERE event_id = p_event_id;

  UPDATE public.events
  SET leaderboard_mode = p_mode, leaderboard_frozen_at = NULL
  WHERE id = p_event_id;

  RETURN jsonb_build_object('ok', true, 'mode', p_mode);
END
$$;

-- ═══ Права ═══════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.freeze_leaderboard(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unfreeze_leaderboard(uuid, public.leaderboard_mode)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_leaderboard(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unfreeze_leaderboard(uuid, public.leaderboard_mode) TO service_role;

GRANT SELECT ON public.leaderboard_public TO anon, authenticated;
GRANT SELECT ON public.team_scores, public.leaderboard, public.team_progress TO authenticated;
GRANT SELECT ON public.team_scores, public.leaderboard, public.team_progress,
  public.admin_dashboard, public.leaderboard_public TO service_role;
