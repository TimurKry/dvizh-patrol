import type { Metadata } from 'next';
import { BottomNav } from '@/components/nav/bottom-nav';
import { SubmissionRow } from '@/components/game/task-card';
import { ButtonLink } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/surface';
import { EmptyState } from '@/components/ui/feedback';
import { getTeamSubmissions } from '@/lib/data/tasks';
import { requireTeamSession } from '@/lib/session/require';
import { photosWord } from '@/lib/messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Отправки' };

export default async function SubmissionsPage() {
  const session = await requireTeamSession();
  const submissions = await getTeamSubmissions(session.teamId);

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <Eyebrow>Команда «{session.team.name}»</Eyebrow>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-heading md:text-heading-lg">Отправки</h1>
          <p className="text-body text-stone">
            {submissions.length} {photosWord(submissions.length)}
          </p>
        </div>

        <div className="mt-8">
          {submissions.length === 0 ? (
            <EmptyState
              title="Пока ничего не отправлено"
              description="Здесь появятся все ваши фотографии и результаты их проверки."
              action={
                <ButtonLink href="/tasks" size="sm">
                  К заданиям
                </ButtonLink>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {submissions.map(({ submission, task, previewUrl }) => (
                <li key={submission.id}>
                  <SubmissionRow
                    href={`/submissions/${submission.id}`}
                    title={task?.title ?? 'Задание удалено'}
                    taskNumber={task?.number ?? null}
                    status={submission.status}
                    points={submission.awarded_points}
                    previewUrl={previewUrl}
                    submittedAt={submission.submitted_at}
                    timezone={session.event.timezone}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
