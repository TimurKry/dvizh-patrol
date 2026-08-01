-- ─────────────────────────────────────────────────────────────
-- 0005 — Storage
--
-- Три приватных бакета и один публичный.
--
-- Клиент никогда не выбирает путь и не обращается к Storage
-- напрямую с anon-ключом. Сервер строит путь из id отправки и
-- выдаёт одноразовый signed upload URL, поэтому политик для
-- anon/authenticated на приватных бакетах нет вообще: подписанная
-- ссылка авторизует сама себя, всё остальное закрыто.
-- ─────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  -- Фотографии команд. Самое чувствительное, что есть в системе.
  (
    'submission-images', 'submission-images', false,
    5242880,
    ARRAY['image/webp', 'image/jpeg', 'image/png']
  ),
  -- Уменьшенные копии для списков и очереди проверки.
  (
    'submission-previews', 'submission-previews', false,
    1048576,
    ARRAY['image/webp', 'image/jpeg']
  ),
  -- Эталонные изображения заданий.
  (
    'task-reference-images', 'task-reference-images', false,
    5242880,
    ARRAY['image/webp', 'image/jpeg', 'image/png']
  ),
  -- Постер и прочая афиша. Единственный публичный бакет.
  (
    'event-assets', 'event-assets', true,
    10485760,
    ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/svg+xml']
  )
ON CONFLICT (id) DO UPDATE
SET public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ═══ Политики ════════════════════════════════════════════════

-- Публичный бакет: читать может кто угодно, писать — только сервер.
DROP POLICY IF EXISTS event_assets_public_read ON storage.objects;
CREATE POLICY event_assets_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'event-assets');

-- Администратор работает с эталонами заданий через админку,
-- но она server-side, поэтому клиентских политик на запись нет.
DROP POLICY IF EXISTS task_reference_images_admin_read ON storage.objects;
CREATE POLICY task_reference_images_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'task-reference-images' AND public.is_admin());

DROP POLICY IF EXISTS submission_images_admin_read ON storage.objects;
CREATE POLICY submission_images_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('submission-images', 'submission-previews')
    AND public.is_admin()
  );

-- Команда может прочитать превью только своей отправки.
-- Путь: events/{eventId}/teams/{teamId}/tasks/{taskId}/{file}
-- Второй сегмент после teams — идентификатор команды.
DROP POLICY IF EXISTS submission_images_team_read ON storage.objects;
CREATE POLICY submission_images_team_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('submission-images', 'submission-previews')
    AND public.current_team_id() IS NOT NULL
    AND (storage.foldername(name))[4] = public.current_team_id()::text
  );

COMMENT ON TABLE storage.objects IS
  'Пути отправок: events/{eventId}/teams/{teamId}/tasks/{taskId}/{submissionId}.webp';
