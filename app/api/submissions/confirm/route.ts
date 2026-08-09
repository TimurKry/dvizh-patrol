import { NextResponse, after } from 'next/server';
import sharp from 'sharp';
import { runValidationWorker } from '@/lib/ai/worker';
import { isAiConfigured } from '@/lib/env';
import { checkLocation, checkPlayArea, toPlayArea } from '@/lib/geo';
import { computePerceptualHash, findDuplicate } from '@/lib/image/phash';
import { errorMessage } from '@/lib/messages';
import { getTeamSession } from '@/lib/session/team-session';
import { callRpc, supabaseAdmin } from '@/lib/supabase/admin';
import {
  BUCKETS,
  downloadObject,
  objectExists,
  previewPath,
  uploadObject,
} from '@/lib/storage';
import { submissionConfirmSchema } from '@/lib/validation/schemas';
import type { SubmissionRow, TaskRow } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Скачивание, хэш и превью укладываются в пару секунд, но на
// медленном соединении к хранилищу лучше дать запас.
export const maxDuration = 60;

/** Ширина превью для списков и очереди проверки. */
const PREVIEW_WIDTH = 600;

/**
 * Шаг 3: файл загружен, доводим отправку до готовности.
 *
 * Здесь сервер впервые видит сам файл: считает перцептивный хэш,
 * ищет похожие снимки, делает превью и решает, куда отправку
 * направить — на автоматическую проверку или к организатору.
 */
export async function POST(request: Request) {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', message: errorMessage('unauthorized') },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'validation_failed' }, { status: 400 });
  }

  const parsed = submissionConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation_failed' }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Отправка обязана принадлежать команде из сессии.
  const { data: submissionData } = await db
    .from('submissions')
    .select('*')
    .eq('id', parsed.data.submissionId)
    .eq('team_id', session.teamId)
    .maybeSingle();

  const submission = submissionData as SubmissionRow | null;
  if (!submission) {
    return NextResponse.json(
      { ok: false, error: 'submission_not_found', message: errorMessage('submission_not_found') },
      { status: 404 },
    );
  }

  // Повторное подтверждение — не ошибка: клиент мог потерять
  // ответ и прислать запрос ещё раз.
  if (submission.status !== 'uploading') {
    return NextResponse.json({
      ok: true,
      status: submission.status,
      alreadyConfirmed: true,
    });
  }

  const { data: taskData } = await db
    .from('tasks')
    .select('*')
    .eq('id', submission.task_id)
    .maybeSingle();

  const task = taskData as TaskRow | null;
  if (!task) {
    return NextResponse.json({ ok: false, error: 'task_not_found' }, { status: 404 });
  }

  // Геопозицию проверяем до всего остального: если команда не там,
  // считать хэш и делать превью незачем.
  const location = checkLocation({
    requireLocation: task.require_location,
    taskLatitude: task.latitude,
    taskLongitude: task.longitude,
    radiusMeters: task.radius_meters,
    submissionLatitude: parsed.data.latitude ?? null,
    submissionLongitude: parsed.data.longitude ?? null,
    accuracy: parsed.data.locationAccuracy ?? null,
  });

  if (!location.ok) {
    await db
      .from('submissions')
      .update({ status: 'cancelled', review_reason: location.reason })
      .eq('id', submission.id);

    return NextResponse.json(
      {
        ok: false,
        error: location.reason,
        message: errorMessage(location.reason ?? 'location_required'),
        distance: location.distance,
      },
      { status: 422 },
    );
  }

  // ═══ Игровое поле ══════════════════════════════════════════
  //
  // Проверка отдельно от проверки задания: у задания свой радиус
  // и своя логика, поле же общее для всего квеста.
  //
  // В мягком режиме снимок снаружи не отклоняется, а уходит
  // человеку с пометкой. Это тот же принцип, что и с AI: машина
  // может принять или позвать организатора, но не отказать. Часы
  // в кармане ошибаются, а спорить с командой посреди города
  // некому.
  const area = toPlayArea(session.event);
  const areaVerdict = checkPlayArea({
    area,
    latitude: parsed.data.latitude ?? null,
    longitude: parsed.data.longitude ?? null,
    accuracy: parsed.data.locationAccuracy ?? null,
  });

  if (area && session.event.area_enforced) {
    if (areaVerdict.status === 'unknown') {
      await db
        .from('submissions')
        .update({ status: 'cancelled', review_reason: 'area_location_required' })
        .eq('id', submission.id);

      return NextResponse.json(
        {
          ok: false,
          error: 'area_location_required',
          message: errorMessage('area_location_required'),
        },
        { status: 422 },
      );
    }

    if (areaVerdict.status === 'outside') {
      await db
        .from('submissions')
        .update({ status: 'cancelled', review_reason: 'outside_play_area' })
        .eq('id', submission.id);

      return NextResponse.json(
        {
          ok: false,
          error: 'outside_play_area',
          message: errorMessage('outside_play_area'),
          distance: areaVerdict.distance,
        },
        { status: 422 },
      );
    }
  }

  // Путь записан сервером на шаге start — клиент его не передаёт.
  const storagePath = submission.image_path;
  if (!storagePath) {
    return NextResponse.json(
      { ok: false, error: 'file_missing', message: errorMessage('file_missing') },
      { status: 422 },
    );
  }
  const extension = storagePath.split('.').pop() ?? 'webp';

  // Файл действительно долетел?
  const exists = await objectExists(BUCKETS.submissions, storagePath);
  if (!exists) {
    await db
      .from('submissions')
      .update({ status: 'upload_failed' })
      .eq('id', submission.id);

    return NextResponse.json(
      {
        ok: false,
        error: 'storage_object_missing',
        message: errorMessage('storage_object_missing'),
      },
      { status: 422 },
    );
  }

  const file = await downloadObject(BUCKETS.submissions, storagePath);
  if (!file) {
    return NextResponse.json(
      { ok: false, error: 'upload_failed', message: errorMessage('upload_failed') },
      { status: 502 },
    );
  }

  // Перцептивный хэш и поиск похожих по всему мероприятию.
  const hash = await computePerceptualHash(file);
  let duplicateId: string | null = null;
  let duplicateSimilarity: number | null = null;

  if (hash) {
    const { data: existing } = await db
      .from('submissions')
      .select('id, perceptual_hash')
      .eq('event_id', session.event.id)
      .not('perceptual_hash', 'is', null)
      .neq('id', submission.id)
      .in('status', ['pending', 'checking', 'accepted', 'manual_review']);

    const match = findDuplicate(
      hash,
      (existing as Array<{ id: string; perceptual_hash: string }> | null) ?? [],
    );

    if (match) {
      duplicateId = match.submissionId;
      duplicateSimilarity = Number(match.similarity.toFixed(4));
    }
  }

  // Превью: списки и очередь проверки не должны тянуть оригиналы.
  const preview = await buildPreview(file);
  let storedPreviewPath: string | null = null;

  if (preview) {
    const path = previewPath({
      eventId: session.event.id,
      teamId: session.teamId,
      taskId: task.id,
      submissionId: submission.id,
    });
    if (await uploadObject(BUCKETS.previews, path, preview, 'image/webp')) {
      storedPreviewPath = path;
    }
  }

  const result = await callRpc<{ status: string; reviewReason: string | null }>(
    'confirm_submission',
    {
      p_submission_id: submission.id,
      p_image_path: storagePath,
      p_bytes: file.byteLength,
      p_mime_type: mimeFor(extension),
      p_perceptual_hash: hash,
      p_duplicate_of: duplicateId,
      p_duplicate_similarity: duplicateSimilarity,
      p_latitude: parsed.data.latitude ?? null,
      p_longitude: parsed.data.longitude ?? null,
      p_location_accuracy: parsed.data.locationAccuracy ?? null,
      p_ai_available: isAiConfigured(),
      // Мягкий режим: снаружи поля — к организатору, не отказ.
      p_outside_area: areaVerdict.status === 'outside',
    },
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, message: errorMessage(result.error) },
      { status: 500 },
    );
  }

  if (storedPreviewPath) {
    await db
      .from('submissions')
      .update({ preview_path: storedPreviewPath })
      .eq('id', submission.id);
  }

  // Проверку запускаем сразу после ответа участнику: ждать
  // минутный тик расписания незачем, а сам ответ задерживать
  // нельзя — человек должен идти дальше.
  if (result.data.status === 'pending') {
    after(async () => {
      try {
        await runValidationWorker({ limit: 1 });
      } catch {
        // Не получилось — очередь заберёт следующий проход.
      }
    });
  }

  return NextResponse.json({
    ok: true,
    status: result.data.status,
    reviewReason: result.data.reviewReason,
    message: 'Фото загружено и отправлено на проверку. Можно продолжать квест.',
  });
}

function mimeFor(extension: string): string {
  if (extension === 'webp') return 'image/webp';
  if (extension === 'png') return 'image/png';
  return 'image/jpeg';
}

async function buildPreview(file: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(file)
      .rotate()
      .resize(PREVIEW_WIDTH, null, { withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
  } catch {
    // Без превью список покажет оригинал — не повод отклонять отправку.
    return null;
  }
}
