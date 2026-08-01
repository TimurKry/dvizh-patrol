import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/surface';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { getCurrentEvent } from '@/lib/data/event';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/data/leaderboard';
import { getTeamSession } from '@/lib/session/team-session';
import { pointsWord, tasksWord, teamsWord } from '@/lib/messages';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Рейтинг',
  description: 'Текущий рейтинг команд фото-квеста «Движ-Патруль».',
};

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li
      className={cn(
        'flex items-center gap-4 rounded-[16px] border px-4 py-3',
        entry.isOwn ? 'border-ink bg-paper' : 'border-hairline bg-paper',
      )}
    >
      <span
        className="w-8 shrink-0 text-heading-sm tabular-nums tracking-[-0.48px]"
        aria-label={`Место ${entry.position}`}
      >
        {entry.position}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium">
          {entry.teamName}
          {entry.isOwn && <span className="ml-2 text-caption text-sepia">— ваша команда</span>}
        </p>
        <p className="text-caption text-sepia">
          {entry.acceptedCount} {tasksWord(entry.acceptedCount)} принято
        </p>
      </div>

      <span className="shrink-0 text-subheading tabular-nums">
        {entry.totalPoints}
        <span className="ml-1 text-caption text-sepia">{pointsWord(entry.totalPoints)}</span>
      </span>
    </li>
  );
}

export default async function LeaderboardPage() {
  const [event, session] = await Promise.all([getCurrentEvent(), getTeamSession()]);

  if (!event) {
    return (
      <div className="page-well py-20">
        <h1 className="text-heading">Рейтинг</h1>
        <p className="mt-4 text-body text-sepia">Мероприятие ещё не заведено.</p>
      </div>
    );
  }

  const view = await getLeaderboard(event, session?.teamId ?? null);

  return (
    <div className="page-well py-10 md:py-16">
      <div className="mx-auto max-w-2xl">
        <Eyebrow>{event.city}</Eyebrow>
        <h1 className="mt-3 text-heading md:text-heading-lg">Рейтинг</h1>

        <div className="mt-8">
          {view.mode === 'not_started' && (
            <EmptyState
              title="Квест ещё не начался"
              description="Таблица появится, как только организатор запустит мероприятие."
              action={
                <ButtonLink href="/" variant="secondary" size="sm">
                  На главную
                </ButtonLink>
              }
            />
          )}

          {view.mode === 'hidden' && (
            <EmptyState
              title="Рейтинг скрыт"
              description="Организатор закрыл таблицу. Результаты объявят после финиша."
            />
          )}

          {view.mode === 'team_position_only' && (
            <div className="flex flex-col gap-6">
              <Notice icon="•">
                Организатор показывает каждой команде только её собственное место.
              </Notice>

              {view.entry ? (
                <Card className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="text-caption text-sepia">Ваше место</p>
                  <p className="text-display tracking-[-2.32px]">{view.entry.position}</p>
                  <p className="text-body text-sepia">
                    из {view.totalTeams} {teamsWord(view.totalTeams)}
                  </p>
                  <p className="mt-2 text-subheading">
                    {view.entry.totalPoints} {pointsWord(view.entry.totalPoints)}
                  </p>
                </Card>
              ) : (
                <EmptyState
                  title="Вы ещё не в таблице"
                  description="Место появится после первого принятого задания."
                />
              )}
            </div>
          )}

          {(view.mode === 'public' || view.mode === 'frozen') && (
            <div className="flex flex-col gap-4">
              {view.mode === 'frozen' && (
                <Notice tone="strong" icon="❄">
                  Рейтинг заморожен
                  {view.frozenAt
                    ? ` — показано состояние на ${new Intl.DateTimeFormat('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                        timeZone: event.timezone,
                      }).format(new Date(view.frozenAt))}`
                    : ''}
                  . Новые начисления в таблице пока не отражаются.
                </Notice>
              )}

              {view.entries.length === 0 ? (
                <EmptyState
                  title="Пока пусто"
                  description="Ни одно задание ещё не принято. Первая же принятая фотография попадёт сюда."
                />
              ) : (
                <ol className="flex flex-col gap-2">
                  {view.entries.map((entry) => (
                    <Row key={entry.teamId} entry={entry} />
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {view.mode !== 'hidden' && view.mode !== 'not_started' && (
          <p className="mt-6 text-caption text-sepia">
            Сортировка: сумма баллов, затем число принятых заданий, затем время последнего
            принятого задания.
          </p>
        )}
      </div>
    </div>
  );
}
