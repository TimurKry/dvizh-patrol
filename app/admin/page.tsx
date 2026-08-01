import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/admin/action-form';
import { changeEventStatusAction, requeueStaleAction } from '@/actions/admin';
import { Card, Eyebrow } from '@/components/ui/surface';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import { isAiConfigured } from '@/lib/env';
import { getCurrentEvent, formatEventDateLong, formatEventTime } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { EVENT_STATUS_TEXT, membersWord, teamsWord } from '@/lib/messages';
import type { AdminDashboardRow, EventStatus, SubmissionRow, TaskRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Сводка' };

const NEXT_STATUS: Partial<Record<EventStatus, Array<{ status: EventStatus; label: string }>>> = {
  draft: [{ status: 'registration', label: 'Открыть регистрацию' }],
  registration: [{ status: 'live', label: 'Запустить квест' }],
  live: [
    { status: 'paused', label: 'Пауза' },
    { status: 'finished', label: 'Завершить' },
  ],
  paused: [
    { status: 'live', label: 'Продолжить' },
    { status: 'finished', label: 'Завершить' },
  ],
  finished: [{ status: 'archived', label: 'В архив' }],
};

export default async function AdminDashboardPage() {
  await requireAdmin();
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-10">
        <EmptyState
          title="Мероприятие не заведено"
          description="Создайте событие в базе или примените миграцию с посевными данными."
        />
      </div>
    );
  }

  const db = supabaseAdmin();
  const [statsResult, recentResult] = await Promise.all([
    db.from('admin_dashboard').select('*').eq('event_id', event.id).maybeSingle(),
    db
      .from('submissions')
      .select('*, tasks:task_id (number, title), teams:team_id (name)')
      .eq('event_id', event.id)
      .not('status', 'in', '("draft","uploading")')
      .order('submitted_at', { ascending: false })
      .limit(8),
  ]);

  const stats = statsResult.data as AdminDashboardRow | null;
  const recent =
    (recentResult.data as Array<
      SubmissionRow & { tasks: Pick<TaskRow, 'number' | 'title'> | null; teams: { name: string } | null }
    > | null) ?? [];

  const aiReady = isAiConfigured() && event.ai_validation_enabled;
  const needsAttention = (stats?.submissions_manual_review ?? 0) + (stats?.ai_failed_jobs ?? 0);

  return (
    <div className="page-well flex flex-col gap-8 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>{EVENT_STATUS_TEXT[event.status] ?? event.status}</Eyebrow>
          <h1 className="mt-2 text-heading">{event.title}</h1>
          <p className="mt-1 text-body text-stone">
            {event.city}, {formatEventDateLong(event)} в {formatEventTime(event)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(NEXT_STATUS[event.status] ?? []).map((transition) => (
            <ActionButton
              key={transition.status}
              action={changeEventStatusAction}
              values={{ eventId: event.id, status: transition.status }}
              variant={transition.status === 'live' ? 'primary' : 'secondary'}
              confirm={
                transition.status === 'live'
                  ? 'Запустить квест? Задания станут видны всем командам, регистрация закроется.'
                  : transition.status === 'finished'
                    ? 'Завершить квест? Новые отправки будут заблокированы.'
                    : undefined
              }
            >
              {transition.label}
            </ActionButton>
          ))}
        </div>
      </header>

      {!aiReady && (
        <Notice tone="strong" icon="•">
          Автоматическая проверка выключена{' '}
          {isAiConfigured() ? 'настройкой мероприятия' : '— не задан GEMINI_API_KEY'}. Все
          фотографии уходят в ручную проверку. Это штатный режим: мероприятие можно провести
          полностью вручную.
        </Notice>
      )}

      {needsAttention > 0 && (
        <Notice tone="strong" icon="⁂">
          Ждут вашего решения: {needsAttention}.{' '}
          <Link href="/admin/submissions" className="underline underline-offset-2">
            Открыть очередь
          </Link>
        </Notice>
      )}

      {/* ═══ Числа ══════════════════════════════════════════ */}
      <section>
        <h2 className="sr-only">Показатели</h2>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            {
              term: 'Команды',
              value: `${stats?.teams_active ?? 0} / ${event.max_teams}`,
              note: `${stats?.teams_confirmed ?? 0} подтверждено, ${stats?.teams_pending ?? 0} ждут`,
            },
            {
              term: 'Участники',
              value: `${stats?.members_total ?? 0} / ${event.max_teams * event.team_size}`,
              note: membersWord(stats?.members_total ?? 0),
            },
            {
              term: 'Задания',
              value: String(stats?.tasks_active ?? 0),
              note: 'активных',
            },
            {
              term: 'Отправки',
              value: String(stats?.submissions_total ?? 0),
              note: `${stats?.submissions_accepted ?? 0} принято`,
            },
          ].map((item) => (
            <Card key={item.term} className="flex flex-col gap-1">
              <dt className="text-caption text-stone">{item.term}</dt>
              <dd className="text-heading-sm tabular-nums tracking-[-0.48px]">{item.value}</dd>
              <p className="text-caption text-pebble">{item.note}</p>
            </Card>
          ))}
        </dl>
      </section>

      {/* ═══ Очередь ════════════════════════════════════════ */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-subheading">Очередь проверки</h2>
          <ActionButton action={requeueStaleAction} values={{ eventId: event.id }}>
            Повторно обработать зависшие
          </ActionButton>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            ['Ожидают', stats?.submissions_pending ?? 0],
            ['Проверяются', stats?.submissions_checking ?? 0],
            ['Ручная проверка', stats?.submissions_manual_review ?? 0],
            ['Принято', stats?.submissions_accepted ?? 0],
            ['Отклонено', stats?.submissions_rejected ?? 0],
            ['Похожие', stats?.possible_duplicates ?? 0],
          ].map(([label, value]) => (
            <Card key={String(label)} className="flex flex-col gap-1">
              <span className="text-caption text-stone">{label}</span>
              <span className="text-subheading tabular-nums">{value}</span>
            </Card>
          ))}
        </div>

        {(stats?.ai_failed_jobs ?? 0) > 0 && (
          <Notice icon="!">
            Задач с ошибкой проверки: {stats?.ai_failed_jobs}. Все они уже переведены в ручную
            проверку — квест не остановился.
          </Notice>
        )}
      </section>

      {/* ═══ Последние отправки ═════════════════════════════ */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-subheading">Последние отправки</h2>
          <Link href="/admin/submissions" className="text-caption underline underline-offset-2">
            Все отправки
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState title="Отправок пока нет" />
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/admin/submissions/${row.id}`}
                  className="flex items-center justify-between gap-4 rounded-[16px] border border-hairline bg-paper-white px-4 py-3 hover:border-hairline-strong"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body">
                      {row.tasks ? `${row.tasks.number}. ${row.tasks.title}` : 'Задание удалено'}
                    </p>
                    <p className="text-caption text-stone">{row.teams?.name ?? '—'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.duplicate_submission_id && <Tag>похожа</Tag>}
                    <StatusBadge status={row.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap gap-2 border-t border-hairline pt-6">
        <Tag>{teamsWord(event.max_teams)}: до {event.max_teams}</Tag>
        <Tag>в команде до {event.team_size}</Tag>
        <Tag>регистрация {event.registration_open ? 'открыта' : 'закрыта'}</Tag>
        <Tag>рейтинг: {event.leaderboard_mode}</Tag>
        <Tag>порог проверки {event.ai_accept_threshold}</Tag>
      </section>
    </div>
  );
}
