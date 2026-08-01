import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/nav/bottom-nav';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';
import { Notice } from '@/components/ui/feedback';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { getTeamSubmission } from '@/lib/data/tasks';
import { requireTeamSession } from '@/lib/session/require';
import {
  REVIEW_REASON_TEXT,
  SUBMISSION_STATUS_TEXT,
  attemptsWord,
  pointsWord,
} from '@/lib/messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Отправка' };

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const session = await requireTeamSession();
  const { submissionId } = await params;

  // Запрос ограничен командой из сессии: чужую отправку по
  // прямой ссылке открыть нельзя.
  const record = await getTeamSubmission(session.teamId, submissionId);
  if (!record) notFound();

  const { submission, task, imageUrl, previewUrl } = record;
  const presentation = SUBMISSION_STATUS_TEXT[submission.status];

  const time = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: session.event.timezone,
  }).format(new Date(submission.submitted_at));

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link
          href="/submissions"
          className="inline-flex items-center gap-2 text-caption text-sepia hover:text-ink"
        >
          <span aria-hidden="true">←</span> Все отправки
        </Link>

        <header className="flex flex-col gap-3">
          {task && <p className="text-caption text-sand">Задание {task.number}</p>}
          <h1 className="text-heading">{task?.title ?? 'Задание удалено'}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={submission.status} />
            <Tag>попытка {submission.attempt_number}</Tag>
            <Tag>{time}</Tag>
          </div>
        </header>

        {/* Оригинал показываем крупно: это главное содержимое
            экрана. Превью — запасной вариант. */}
        {(imageUrl ?? previewUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl ?? previewUrl ?? ''}
            alt={`Фотография к заданию ${task?.number ?? ''}`}
            className="w-full rounded-[16px] border border-hairline"
          />
        )}

        <Notice icon={presentation.icon}>
          <p className="font-medium">{presentation.label}</p>
          <p className="mt-1 text-sepia">{presentation.hint}</p>
        </Notice>

        {submission.status === 'accepted' && (
          <Card className="flex items-center justify-between gap-3">
            <span className="text-body">Начислено за задание</span>
            <span className="text-heading-sm tabular-nums">
              +{submission.awarded_points} {pointsWord(submission.awarded_points)}
            </span>
          </Card>
        )}

        {submission.review_reason && submission.status !== 'accepted' && (
          <Card className="flex flex-col gap-2">
            <h2 className="text-caption font-medium uppercase tracking-[0.08em] text-sepia">
              Причина
            </h2>
            <p className="text-body">
              {REVIEW_REASON_TEXT[submission.review_reason] ?? submission.review_reason}
            </p>
          </Card>
        )}

        {submission.admin_comment && (
          <Card className="flex flex-col gap-2">
            <h2 className="text-caption font-medium uppercase tracking-[0.08em] text-sepia">
              Комментарий организатора
            </h2>
            <p className="text-body">{submission.admin_comment}</p>
          </Card>
        )}

        {/* Результат автоматической проверки показываем без
            технических подробностей: участнику важен вывод. */}
        {submission.ai_result?.reason && (
          <Card className="flex flex-col gap-2">
            <h2 className="text-caption font-medium uppercase tracking-[0.08em] text-sepia">
              Автоматическая проверка
            </h2>
            <p className="text-body">{submission.ai_result.reason}</p>
          </Card>
        )}

        {task && (
          <div className="flex flex-wrap gap-3 pt-2">
            <ButtonLink href={`/tasks/${task.id}`} variant="secondary" size="sm">
              К заданию
            </ButtonLink>
            {submission.status === 'rejected' && (
              <p className="self-center text-caption text-sepia">
                Если попытки остались, можно отправить другую фотографию.
              </p>
            )}
          </div>
        )}

        {task && submission.status === 'rejected' && (
          <p className="text-caption text-sepia">
            Всего попыток по заданию: {task.max_attempts} {attemptsWord(task.max_attempts)}.
          </p>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
