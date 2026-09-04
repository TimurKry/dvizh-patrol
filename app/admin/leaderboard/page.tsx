import type { Metadata } from 'next';
import { ActionButton } from '@/components/admin/action-form';
import { setLeaderboardModeAction } from '@/actions/admin';
import { Card, Eyebrow } from '@/components/ui/surface';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { LEADERBOARD_MODE_TEXT, pointsWord, tasksWord } from '@/lib/messages';
import { LEADERBOARD_MODES, type LeaderboardRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Рейтинг' };

const MODE_HINT: Record<string, string> = {
  public: 'Все команды видят полную таблицу.',
  team_position_only: 'Каждая команда видит только своё место и свои баллы.',
  hidden: 'Рейтинг закрыт полностью.',
  frozen: 'Показывается сохранённый снимок, новые начисления в нём не отражаются.',
};

export default async function AdminLeaderboardPage() {
  await requireAdmin();
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-10">
        <EmptyState title="Мероприятие не найдено" />
      </div>
    );
  }

  const db = supabaseAdmin();
  const [liveResult, snapshotResult] = await Promise.all([
    db
      .from('leaderboard')
      .select('*')
      .eq('event_id', event.id)
      .order('position', { ascending: true }),
    db
      .from('leaderboard_snapshots')
      .select('*')
      .eq('event_id', event.id)
      .order('position', { ascending: true }),
  ]);

  const live = (liveResult.data as LeaderboardRow[] | null) ?? [];
  const snapshot =
    (snapshotResult.data as Array<{
      position: number;
      team_name: string;
      total_points: number;
      accepted_count: number;
    }> | null) ?? [];

  return (
    <div className="page-well flex max-w-3xl flex-col gap-6 py-8">
      <header>
        <Eyebrow>Управление</Eyebrow>
        <h1 className="mt-2 text-headline">Рейтинг</h1>
        <p className="mt-2 text-body text-muted">
          Текущий режим: <strong>{LEADERBOARD_MODE_TEXT[event.leaderboard_mode]}</strong>.{' '}
          {MODE_HINT[event.leaderboard_mode]}
        </p>
      </header>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-body-lg">Режим показа</h2>
        <div className="flex flex-wrap gap-2">
          {LEADERBOARD_MODES.map((mode) => (
            <ActionButton
              key={mode}
              action={setLeaderboardModeAction}
              values={{ eventId: event.id, mode }}
              variant={event.leaderboard_mode === mode ? 'primary' : 'secondary'}
              confirm={
                mode === 'frozen'
                  ? 'Заморозить рейтинг? Будет сохранён снимок текущей таблицы.'
                  : event.leaderboard_mode === 'frozen'
                    ? 'Разморозить рейтинг? Сохранённый снимок будет удалён.'
                    : undefined
              }
            >
              {LEADERBOARD_MODE_TEXT[mode]}
            </ActionButton>
          ))}
        </div>

        {event.leaderboard_mode === 'frozen' && event.leaderboard_frozen_at && (
          <Notice icon="frozen">
            Заморожено{' '}
            {new Intl.DateTimeFormat('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: event.timezone,
            }).format(new Date(event.leaderboard_frozen_at))}
            . Ниже видно и снимок, и реальное положение дел.
          </Notice>
        )}
      </Card>

      {/* ═══ Актуальный рейтинг ═════════════════════════════ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-body-lg">
          Актуальный рейтинг {event.leaderboard_mode === 'frozen' && '(участникам не виден)'}
        </h2>

        {live.length === 0 ? (
          <EmptyState title="Пока никто не набрал баллов" />
        ) : (
          <ol className="flex flex-col gap-2">
            {live.map((row) => (
              <li
                key={row.team_id}
                className="flex items-center gap-4 border border-hairline bg-panel px-4 py-3"
              >
                <span className="w-8 shrink-0 text-title tabular-nums">{row.position}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body">{row.team_name}</p>
                  <p className="text-caption text-muted">
                    {row.accepted_count} {tasksWord(row.accepted_count)} принято
                  </p>
                </div>
                <span className="shrink-0 text-body-lg tabular-nums">
                  {row.total_points}
                  <span className="ml-1 text-caption text-muted">
                    {pointsWord(row.total_points)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ═══ Снимок ═════════════════════════════════════════ */}
      {snapshot.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-body-lg">Сохранённый снимок</h2>
            <Tag>его видят участники</Tag>
          </div>
          <ol className="flex flex-col gap-2">
            {snapshot.map((row) => (
              <li
                key={`${row.position}-${row.team_name}`}
                className="flex items-center gap-4 border border-dashed border-hairline-strong bg-panel px-4 py-3"
              >
                <span className="w-8 shrink-0 text-title tabular-nums">{row.position}</span>
                <span className="min-w-0 flex-1 truncate text-body">{row.team_name}</span>
                <span className="shrink-0 tabular-nums">{row.total_points}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-caption text-muted">
        Сортировка: сумма баллов, затем число принятых заданий, затем время последнего принятого
        задания. Баллы считаются как сумма журнала начислений — отдельного счётчика в базе нет.
      </p>
    </div>
  );
}
