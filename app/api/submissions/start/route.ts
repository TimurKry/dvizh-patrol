import { NextResponse } from 'next/server';
import { z } from 'zod';
import { maxUploadBytes } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTeamSession } from '@/lib/session/team-session';
import { callRpc, supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKETS, createSignedUpload, extensionFor, submissionPath } from '@/lib/storage';
import { submissionStartSchema } from '@/lib/validation/schemas';
import { errorMessage } from '@/lib/messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Шаг 1: резервируем отправку и выдаём ссылку на загрузку.
 *
 * Порядок именно такой, потому что путь в хранилище строится из
 * идентификатора отправки. Строка создаётся первой, файл кладётся
 * вторым, подтверждение приходит третьим.
 *
 * Команда берётся из cookie. Всё, что клиент присылает про
 * team_id, points или status, игнорируется.
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

  const parsed = submissionStartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_failed',
        message: errorMessage('validation_failed'),
        issues: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  if (parsed.data.bytes > maxUploadBytes()) {
    return NextResponse.json(
      { ok: false, error: 'file_too_large', message: errorMessage('file_too_large') },
      { status: 413 },
    );
  }

  // Лимит по команде, а не по адресу: четыре человека за одним
  // мобильным NAT не должны блокировать друг друга.
  const limit = await checkRateLimit('createSubmission', session.teamId);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', message: errorMessage('rate_limited') },
      { status: 429 },
    );
  }

  const slot = await callRpc<{
    submissionId: string;
    attemptNumber: number;
    status?: string;
    reused: boolean;
  }>('create_submission_slot', {
    p_team_id: session.teamId,
    p_task_id: parsed.data.taskId,
    p_member_id: session.memberId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_allow_paused: false,
  });

  if (!slot.ok) {
    return NextResponse.json(
      { ok: false, error: slot.error, message: errorMessage(slot.error) },
      { status: 409 },
    );
  }

  // Тот же ключ идемпотентности, и отправка уже прошла дальше
  // загрузки — значит, повторять не нужно.
  if (slot.data.reused && slot.data.status && slot.data.status !== 'uploading') {
    return NextResponse.json({
      ok: true,
      alreadySubmitted: true,
      submissionId: slot.data.submissionId,
      status: slot.data.status,
    });
  }

  const extension = extensionFor(parsed.data.contentType);
  const path = submissionPath({
    eventId: session.event.id,
    teamId: session.teamId,
    taskId: parsed.data.taskId,
    submissionId: slot.data.submissionId,
    extension,
  });

  const upload = await createSignedUpload(BUCKETS.submissions, path);
  if (!upload.ok) {
    return NextResponse.json(
      { ok: false, error: 'upload_failed', message: errorMessage('upload_failed') },
      { status: 502 },
    );
  }

  // Запоминаем путь сразу: подтверждение возьмёт его из базы и не
  // будет доверять тому, что пришлёт клиент.
  await supabaseAdmin()
    .from('submissions')
    .update({ image_path: path, mime_type: parsed.data.contentType })
    .eq('id', slot.data.submissionId);

  return NextResponse.json({
    ok: true,
    alreadySubmitted: false,
    submissionId: slot.data.submissionId,
    attemptNumber: slot.data.attemptNumber,
    bucket: BUCKETS.submissions,
    path: upload.path,
    token: upload.token,
  });
}
