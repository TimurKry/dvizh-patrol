import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/nav/bottom-nav';
import { PhotoUpload } from '@/components/game/photo-upload';
import { LiveRefresh } from '@/components/game/live-refresh';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { env } from '@/lib/env';
import { getTaskForTeam, getTaskReferences } from '@/lib/data/tasks';
import { requireTeamSession } from '@/lib/session/require';
import {
  REVIEW_REASON_TEXT,
  SUBMISSION_STATUS_TEXT,
  TASK_CATEGORY_TEXT,
  TASK_DIFFICULTY_TEXT,
  attemptsWord,
  membersWord,
  pointsWord,
} from '@/lib/messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Задание' };

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireTeamSession();
  const { taskId } = await params;

  const eventLive = session.event.status === 'live';
  const item = await getTaskForTeam(session.event.id, session.teamId, taskId, { eventLive });

  if (!item) notFound();

  // На этапе регистрации задания закрыты для всех.
  if (!['live', 'paused', 'finished'].includes(session.event.status)) {
    return (
      <div className="page-well with-bottom-nav py-8">
        <EmptyState
          title="Задания ещё закрыты"
          description="Список откроется в момент старта квеста."
          action={
            <Link href="/team" className="text-body underline underline-offset-2">
              На страницу команды
            </Link>
          }
        />
        <BottomNav />
      </div>
    );
  }

  const { task, state, attemptsLeft, latestSubmission, canSubmit } = item;
  const references = await getTaskReferences(task.id);
  const config = env();

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-2 text-caption text-stone hover:text-ink-black"
        >
          <span aria-hidden="true">←</span> Все задания
        </Link>

        <header className="mt-5 flex flex-col gap-3">
          <p className="text-caption text-pebble">Задание {task.number}</p>
          <h1 className="text-heading md:text-heading-lg">{task.title}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <Tag emphasis>
              {task.points} {pointsWord(task.points)}
            </Tag>
            <Tag>{TASK_CATEGORY_TEXT[task.category]}</Tag>
            <Tag>{TASK_DIFFICULTY_TEXT[task.difficulty]}</Tag>
            {task.minimum_people > 0 && (
              <Tag>
                минимум {task.minimum_people} {membersWord(task.minimum_people)} в кадре
              </Tag>
            )}
            {task.require_location && <Tag>нужна геопозиция</Tag>}
          </div>
        </header>

        {/* ═══ Эталон ═══════════════════════════════════════ */}
        {references.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {references.map((reference) => (
              <figure key={reference.id} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={reference.url}
                  alt={reference.caption ?? `Пример к заданию ${task.number}`}
                  className="w-full rounded-[12px] border border-hairline"
                />
                {reference.caption && (
                  <figcaption className="text-caption text-stone">{reference.caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        )}

        {/* ═══ Описание ═════════════════════════════════════ */}
        <div className="mt-6 flex flex-col gap-4">
          <p className="whitespace-pre-line text-body">{task.description}</p>

          {task.criteria.length > 0 && (
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-caption font-medium uppercase tracking-[0.08em] text-stone">
                Что должно быть в кадре
              </h2>
              <ul className="flex flex-col gap-2">
                {task.criteria.map((criterion, index) => (
                  <li key={index} className="flex gap-3 text-body text-stone">
                    <span aria-hidden="true" className="text-pebble">
                      {index + 1}.
                    </span>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ═══ Текущее состояние ════════════════════════════ */}
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {latestSubmission ? (
                <StatusBadge status={latestSubmission.status} />
              ) : (
                <Tag>ещё не отправляли</Tag>
              )}
            </div>
            <p className="text-caption text-stone">
              {state === 'accepted'
                ? 'задание засчитано'
                : `осталось ${attemptsLeft} ${attemptsWord(attemptsLeft)} из ${task.max_attempts}`}
            </p>
          </div>

          {latestSubmission && (
            <Notice icon={SUBMISSION_STATUS_TEXT[latestSubmission.status].icon}>
              <p>{SUBMISSION_STATUS_TEXT[latestSubmission.status].hint}</p>
              {latestSubmission.review_reason && (
                <p className="mt-1 text-caption text-stone">
                  {REVIEW_REASON_TEXT[latestSubmission.review_reason] ??
                    latestSubmission.review_reason}
                </p>
              )}
              {latestSubmission.admin_comment && (
                <p className="mt-2 text-caption">
                  Комментарий организатора: {latestSubmission.admin_comment}
                </p>
              )}
              {latestSubmission.awarded_points > 0 && (
                <p className="mt-2 text-caption">
                  Начислено: {latestSubmission.awarded_points}{' '}
                  {pointsWord(latestSubmission.awarded_points)}
                </p>
              )}
            </Notice>
          )}
        </div>

        {/* ═══ Отправка ═════════════════════════════════════ */}
        <div className="mt-8">
          {canSubmit ? (
            <PhotoUpload
              taskId={task.id}
              requireLocation={task.require_location}
              maxLongEdge={config.MAX_IMAGE_LONG_EDGE}
              maxBytes={config.MAX_UPLOAD_SIZE_MB * 1024 * 1024}
              attemptsLeft={attemptsLeft}
            />
          ) : (
            <Card className="flex flex-col gap-4 p-5">
              <p className="text-body">
                {state === 'accepted'
                  ? 'Задание уже засчитано вашей команде. Новую фотографию отправить нельзя.'
                  : state === 'in_review'
                    ? 'Фотография по этому заданию уже на проверке. Дождитесь результата.'
                    : state === 'attempts_exhausted'
                      ? 'Попытки по этому заданию закончились.'
                      : session.event.status === 'paused'
                        ? 'Квест приостановлен. Отправка временно недоступна.'
                        : 'Квест завершён — новые отправки закрыты.'}
              </p>
              <ButtonLink href="/tasks" variant="secondary" className="self-start">
                К другим заданиям
              </ButtonLink>
            </Card>
          )}
        </div>
      </div>

      <LiveRefresh
        active={
          latestSubmission !== null &&
          ['pending', 'checking', 'manual_review'].includes(latestSubmission.status)
        }
      />
      <BottomNav />
    </div>
  );
}
