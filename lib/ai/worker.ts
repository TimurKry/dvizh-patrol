import 'server-only';
import { randomUUID } from 'node:crypto';
import { env, isAiConfigured } from '@/lib/env';
import { decide, validatePhoto } from '@/lib/ai/gemini';
import { BUCKETS, downloadObject } from '@/lib/storage';
import { callRpc, supabaseAdmin } from '@/lib/supabase/admin';
import type { EventRow, SubmissionRow, TaskRow } from '@/types/database';

/**
 * Обработчик очереди проверок.
 *
 * Очередь живёт в самой базе — без Redis, без внешнего брокера,
 * без платного сервиса. На 500 фотографиях за вечер этого более
 * чем достаточно, а в проде становится на один падающий сервис
 * меньше.
 *
 * Обработчик идемпотентен и переносит повторный запуск: задачи
 * берутся через FOR UPDATE SKIP LOCKED, поэтому два параллельных
 * вызова разбирают разные строки и не ждут друг друга. Зависшие
 * задачи возвращаются в очередь по AI_STALE_CHECK_MINUTES.
 */

export interface WorkerReport {
  claimed: number;
  accepted: number;
  manualReview: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

interface ClaimedJob {
  job_id: string;
  submission_id: string;
  attempts: number;
}

/**
 * Один проход обработчика.
 *
 * limit ограничивает размер пачки, а не общее число задач:
 * 500 фотографий разбираются несколькими проходами, а не
 * пятьюстами одновременными запросами к модели.
 */
export async function runValidationWorker(options?: {
  limit?: number;
  workerId?: string;
}): Promise<WorkerReport> {
  const startedAt = Date.now();
  const config = env();
  const workerId = options?.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const limit = options?.limit ?? config.AI_MAX_CONCURRENCY;

  const report: WorkerReport = {
    claimed: 0,
    accepted: 0,
    manualReview: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
  };

  const db = supabaseAdmin();

  const { data, error } = await db.rpc('claim_validation_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
    p_stale_minutes: config.AI_STALE_CHECK_MINUTES,
  });

  if (error || !data) {
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  const jobs = data as ClaimedJob[];
  report.claimed = jobs.length;

  if (jobs.length === 0) {
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  // Пачка целиком: её размер уже ограничен AI_MAX_CONCURRENCY,
  // поэтому параллельно уходит не больше разрешённого.
  const outcomes = await Promise.all(jobs.map((job) => processJob(job)));

  for (const outcome of outcomes) {
    if (outcome === 'accepted') report.accepted += 1;
    else if (outcome === 'manual_review') report.manualReview += 1;
    else if (outcome === 'failed') report.failed += 1;
    else report.skipped += 1;
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

type JobOutcome = 'accepted' | 'manual_review' | 'failed' | 'skipped';

async function processJob(job: ClaimedJob): Promise<JobOutcome> {
  const db = supabaseAdmin();
  const config = env();

  const { data: submissionData } = await db
    .from('submissions')
    .select('*')
    .eq('id', job.submission_id)
    .maybeSingle();

  const submission = submissionData as SubmissionRow | null;

  // Отправку могли уже разобрать вручную, пока задача ждала.
  if (!submission || !['pending', 'checking'].includes(submission.status)) {
    await db.rpc('complete_validation_job', { p_job_id: job.job_id });
    return 'skipped';
  }

  const [{ data: taskData }, { data: eventData }] = await Promise.all([
    db.from('tasks').select('*').eq('id', submission.task_id).maybeSingle(),
    db.from('events').select('*').eq('id', submission.event_id).maybeSingle(),
  ]);

  const task = taskData as TaskRow | null;
  const event = eventData as EventRow | null;

  if (!task || !event) {
    await markManual(job, submission.id, 'ai_error');
    return 'manual_review';
  }

  // Проверку могли выключить уже после постановки в очередь.
  if (!isAiConfigured() || !event.ai_validation_enabled) {
    await markManual(job, submission.id, 'ai_unavailable');
    return 'manual_review';
  }

  if (!submission.image_path) {
    await markManual(job, submission.id, 'ai_error');
    return 'manual_review';
  }

  const file = await downloadObject(BUCKETS.submissions, submission.image_path);
  if (!file) {
    await failJob(job, 'storage_download_failed');
    return 'failed';
  }

  const reference = await loadReference(task.id);

  const outcome = await validatePhoto({
    imageBase64: file.toString('base64'),
    mimeType: submission.mime_type ?? 'image/webp',
    task: {
      title: task.title,
      description: task.description,
      criteria: task.criteria,
      minimumPeople: task.minimum_people,
    },
    referenceBase64: reference?.base64 ?? null,
    referenceMimeType: reference?.mimeType ?? null,
  });

  // ─── Сбой сети или таймаут: повтор, потом человек ─────────
  if (outcome.status === 'error') {
    if (outcome.retryable && job.attempts < config.AI_MAX_ATTEMPTS) {
      await failJob(job, outcome.error);
      return 'failed';
    }
    await markManual(job, submission.id, 'ai_error');
    return 'manual_review';
  }

  // ─── Проверка выключена ───────────────────────────────────
  if (outcome.status === 'disabled') {
    await markManual(job, submission.id, 'ai_unavailable');
    return 'manual_review';
  }

  // ─── Ответ не разобрался ──────────────────────────────────
  if (outcome.status === 'invalid') {
    await markManual(job, submission.id, 'ai_invalid_response');
    return 'manual_review';
  }

  // ─── Решение ──────────────────────────────────────────────
  const verdict = decide(outcome.result, Number(event.ai_accept_threshold));

  await db
    .from('submissions')
    .update({
      ai_result: outcome.result,
      ai_confidence: Number(outcome.result.confidence.toFixed(4)),
    })
    .eq('id', submission.id);

  if (verdict.action === 'accept') {
    const accepted = await callRpc<{ points: number }>('accept_submission', {
      p_submission_id: submission.id,
      p_points: task.points,
      p_admin_id: null,
      p_reason: 'ai_validation',
      p_comment: null,
    });

    if (!accepted.ok) {
      // Например, по заданию уже принята другая фотография.
      await markManual(job, submission.id, 'ai_error');
      return 'manual_review';
    }

    await db.rpc('complete_validation_job', { p_job_id: job.job_id });
    return 'accepted';
  }

  await markManual(job, submission.id, verdict.reason);
  return 'manual_review';
}

async function markManual(job: ClaimedJob, submissionId: string, reason: string): Promise<void> {
  const db = supabaseAdmin();
  await db.rpc('mark_submission_manual_review', {
    p_submission_id: submissionId,
    p_reason: reason,
    p_ai_result: null,
    p_confidence: null,
  });
  await db.rpc('complete_validation_job', { p_job_id: job.job_id });
}

async function failJob(job: ClaimedJob, error: string): Promise<void> {
  await supabaseAdmin().rpc('fail_validation_job', {
    p_job_id: job.job_id,
    p_error: error.slice(0, 500),
    p_max_attempts: env().AI_MAX_ATTEMPTS,
    p_retry_delay_seconds: 20,
  });
}

/** Первое эталонное изображение задания, если оно есть. */
async function loadReference(
  taskId: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const { data } = await supabaseAdmin()
    .from('task_reference_images')
    .select('image_path')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  const path = (data as { image_path: string } | null)?.image_path;
  if (!path) return null;

  const file = await downloadObject(BUCKETS.references, path);
  if (!file) return null;

  const extension = path.split('.').pop()?.toLowerCase();
  const mimeType =
    extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';

  return { base64: file.toString('base64'), mimeType };
}
