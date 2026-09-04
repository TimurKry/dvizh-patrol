-- 0022 · Причина сбоя проверки перестаёт теряться
--
-- До этой миграции `complete_validation_job` затирал `last_error`.
-- Задача, где модель ответила ошибкой, но повторять было
-- бессмысленно (4xx), закрывалась как «completed» с пустой
-- причиной: в базе оставалось только `review_reason = 'ai_error'`,
-- а что именно ответил Google — нигде.
--
-- Так и случилось на первой боевой отправке: проверка не прошла,
-- и восстановить причину было нечем.
--
-- Теперь обработчик может закрыть задачу с пометкой. Пометка
-- техническая и живёт только в админке — участник видит обычную
-- «ручную проверку».

DROP FUNCTION IF EXISTS public.complete_validation_job(uuid);

CREATE OR REPLACE FUNCTION public.complete_validation_job(
  p_job_id uuid,
  p_error  text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.validation_jobs
  SET status = 'completed', completed_at = now(), locked_at = NULL,
      locked_by = NULL, last_error = left(p_error, 500)
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.complete_validation_job(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_validation_job(uuid, text) TO service_role;
