import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReviewPanel } from '@/components/admin/review-panel';
import { Card, Eyebrow } from '@/components/ui/surface';
import { Notice } from '@/components/ui/feedback';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKETS, createSignedUrl, createSignedUrls } from '@/lib/storage';
import { REVIEW_REASON_TEXT, attemptsWord, pointsWord } from '@/lib/messages';
import { Icon } from '@/components/ui/icon';
import type {
  EventRow,
  SubmissionRow,
  TaskReferenceImageRow,
  TaskRow,
  TeamRow,
} from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Проверка отправки' };

export default async function AdminSubmissionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  await requireAdmin();
  const { submissionId } = await params;

  const db = supabaseAdmin();
  const { data } = await db.from('submissions').select('*').eq('id', submissionId).maybeSingle();

  const submission = data as SubmissionRow | null;
  if (!submission) notFound();

  const [taskResult, teamResult, eventResult, refsResult, attemptsResult] = await Promise.all([
    db.from('tasks').select('*').eq('id', submission.task_id).maybeSingle(),
    db.from('teams').select('*').eq('id', submission.team_id).maybeSingle(),
    db.from('events').select('*').eq('id', submission.event_id).maybeSingle(),
    db
      .from('task_reference_images')
      .select('*')
      .eq('task_id', submission.task_id)
      .order('sort_order', { ascending: true })
      .limit(1),
    db
      .from('submissions')
      .select('id, status, attempt_number')
      .eq('team_id', submission.team_id)
      .eq('task_id', submission.task_id),
  ]);

  const task = taskResult.data as TaskRow | null;
  const team = teamResult.data as TeamRow | null;
  const event = eventResult.data as EventRow | null;
  const references = (refsResult.data as TaskReferenceImageRow[] | null) ?? [];
  const attempts = (attemptsResult.data as Array<{ status: string }> | null) ?? [];

  const [imageUrl, referenceUrl] = await Promise.all([
    submission.image_path ? createSignedUrl(BUCKETS.submissions, submission.image_path) : null,
    references[0] ? createSignedUrl(BUCKETS.references, references[0].image_path) : null,
  ]);

  // Предполагаемый дубликат — показываем рядом, чтобы решение
  // принималось глазами, а не по числу похожести.
  let duplicate: { url: string | null; teamName: string; taskTitle: string } | null = null;
  if (submission.duplicate_submission_id) {
    const { data: dup } = await db
      .from('submissions')
      .select('preview_path, image_path, teams:team_id (name), tasks:task_id (title)')
      .eq('id', submission.duplicate_submission_id)
      .maybeSingle();

    if (dup) {
      const row = dup as unknown as {
        preview_path: string | null;
        image_path: string | null;
        teams: { name: string } | null;
        tasks: { title: string } | null;
      };
      const path = row.preview_path ?? row.image_path;
      const bucket = row.preview_path ? BUCKETS.previews : BUCKETS.submissions;
      const signed = path ? await createSignedUrls(bucket, [path]) : null;
      duplicate = {
        url: path ? (signed?.get(path) ?? null) : null,
        teamName: row.teams?.name ?? '—',
        taskTitle: row.tasks?.title ?? '—',
      };
    }
  }

  // Следующая отправка в очереди — чтобы после решения сразу
  // перейти к ней, а не возвращаться в список.
  const { data: nextData } = await db
    .from('submissions')
    .select('id')
    .eq('event_id', submission.event_id)
    .eq('status', 'manual_review')
    .neq('id', submission.id)
    .order('submitted_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const nextId = (nextData as { id: string } | null)?.id ?? null;

  const usedAttempts = attempts.filter((a) =>
    ['pending', 'checking', 'accepted', 'manual_review', 'rejected'].includes(a.status),
  ).length;

  return (
    <div className="page-well flex max-w-5xl flex-col gap-6 py-8">
      <div>
        <Link href="/admin/submissions" className="text-caption text-muted hover:text-ink">
          ← Очередь проверки
        </Link>
        <Eyebrow className="mt-4">{team?.name ?? 'Команда удалена'}</Eyebrow>
        <h1 className="mt-2 text-headline">
          {task ? `${task.number}. ${task.title}` : 'Задание удалено'}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={submission.status} />
          <Tag>
            попытка {submission.attempt_number} из {task?.max_attempts ?? '?'}
          </Tag>
          <Tag>
            использовано {usedAttempts} {attemptsWord(usedAttempts)}
          </Tag>
          {task && (
            <Tag emphasis>
              {task.points} {pointsWord(task.points)}
            </Tag>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ═══ Фотографии ═══════════════════════════════════ */}
        <div className="flex flex-col gap-4">
          <figure className="flex flex-col gap-2">
            <figcaption className="text-caption font-medium uppercase tracking-[0.08em] text-muted">
              Фотография команды
            </figcaption>
            {imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl}
                alt="Фотография, отправленная командой"
                className="w-full border border-hairline"
              />
            ) : (
              <div className="flex aspect-4/3 items-center justify-center border border-dashed border-hairline-strong text-body text-muted">
                Файл недоступен или удалён по сроку хранения
              </div>
            )}
          </figure>

          {referenceUrl && (
            <figure className="flex flex-col gap-2">
              <figcaption className="text-caption font-medium uppercase tracking-[0.08em] text-muted">
                Эталон задания
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceUrl}
                alt="Эталонное изображение задания"
                className="w-full border border-hairline"
              />
            </figure>
          )}

          {duplicate && (
            <Card className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Tag emphasis>похожая фотография</Tag>
                {submission.duplicate_similarity !== null && (
                  <span className="text-caption text-muted">
                    сходство {(Number(submission.duplicate_similarity) * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              {duplicate.url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={duplicate.url}
                  alt="Похожая фотография, отправленная ранее"
                  className="w-full border border-hairline"
                />
              )}

              <p className="text-caption text-muted">
                Команда «{duplicate.teamName}», задание «{duplicate.taskTitle}»
              </p>
              <p className="text-caption text-muted">
                Совпадение не отклоняет отправку автоматически — решение за вами.
              </p>
            </Card>
          )}
        </div>

        {/* ═══ Контекст и решение ═══════════════════════════ */}
        <div className="flex flex-col gap-4">
          {task && (
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-body-lg">Условие</h2>
              <p className="whitespace-pre-line text-body text-muted">{task.description}</p>

              {task.criteria.length > 0 && (
                <>
                  <h3 className="text-caption font-medium uppercase tracking-[0.08em] text-muted">
                    Критерии
                  </h3>
                  <ol className="flex flex-col gap-1">
                    {task.criteria.map((criterion, index) => (
                      <li key={index} className="text-body text-muted">
                        {index + 1}. {criterion}
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {task.minimum_people > 0 && (
                <p className="text-caption text-muted">
                  Минимум людей в кадре: {task.minimum_people}
                </p>
              )}
            </Card>
          )}

          {/* Результат автоматической проверки */}
          {submission.ai_result && (
            <Card className="flex flex-col gap-3 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-body-lg">Автоматическая проверка</h2>
                {submission.ai_confidence !== null && (
                  <span className="text-body tabular-nums">
                    {Number(submission.ai_confidence).toFixed(2)}
                  </span>
                )}
              </div>

              <p className="text-body text-muted">{submission.ai_result.reason}</p>

              {submission.ai_result.checks?.length > 0 && (
                <ul className="flex flex-col gap-2 border-t border-hairline pt-3">
                  {submission.ai_result.checks.map((check, index) => (
                    <li key={index} className="flex gap-2 text-caption">
                      <span className="mt-0.5 shrink-0">
                        <Icon name={check.passed ? 'accepted' : 'rejected'} size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className={check.passed ? '' : 'font-medium'}>{check.criterion}</span>
                        {check.comment && <span className="block text-muted">{check.comment}</span>}
                      </span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted">
                        {check.confidence.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {submission.ai_result.model && (
                <p className="text-caption text-faint">
                  {submission.ai_result.model}
                  {submission.ai_result.durationMs
                    ? ` · ${(submission.ai_result.durationMs / 1000).toFixed(1)} с`
                    : ''}
                </p>
              )}
            </Card>
          )}

          {submission.review_reason && (
            <Notice icon="manual-review">
              Причина ручной проверки:{' '}
              {REVIEW_REASON_TEXT[submission.review_reason] ?? submission.review_reason}
            </Notice>
          )}

          {submission.latitude !== null && submission.longitude !== null && (
            <Card className="flex flex-col gap-1 p-4">
              <h2 className="text-caption font-medium uppercase tracking-[0.08em] text-muted">
                Геопозиция
              </h2>
              <p className="text-body tabular-nums">
                {submission.latitude.toFixed(5)}, {submission.longitude.toFixed(5)}
              </p>
              {submission.location_accuracy !== null && (
                <p className="text-caption text-muted">
                  погрешность ±{Math.round(submission.location_accuracy)} м
                </p>
              )}
              <a
                href={`https://www.openstreetmap.org/?mlat=${submission.latitude}&mlon=${submission.longitude}#map=17/${submission.latitude}/${submission.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-caption underline underline-offset-2"
              >
                Открыть на карте
              </a>
            </Card>
          )}

          <ReviewPanel
            submissionId={submission.id}
            defaultPoints={task?.points ?? 0}
            currentStatus={submission.status}
            currentComment={submission.admin_comment}
            nextSubmissionId={nextId}
            aiAvailable={Boolean(event?.ai_validation_enabled)}
          />
        </div>
      </div>
    </div>
  );
}
