import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomNav } from '@/components/nav/bottom-nav';
import { Countdown } from '@/components/game/countdown';
import { LiveRefresh } from '@/components/game/live-refresh';
import { JoinCodeCard } from '@/components/game/join-code-card';
import { LogoutButton } from '@/components/game/logout-button';
import { ButtonLink } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/surface';
import { Notice } from '@/components/ui/feedback';
import { Tag } from '@/components/ui/status-badge';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTeamStanding } from '@/lib/data/leaderboard';
import { requireTeamSession } from '@/lib/session/require';
import { formatEventDateLong, formatEventTime } from '@/lib/data/event';
import {
  EVENT_STATUS_TEXT,
  TEAM_STATUS_TEXT,
  membersWord,
  pointsWord,
  tasksWord,
} from '@/lib/messages';
import type { ScoreTransactionRow, TeamMemberRow, TeamProgressRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Команда' };

const TRANSACTION_LABEL: Record<string, string> = {
  task_accepted: 'Задание принято',
  manual_adjustment: 'Корректировка',
  bonus: 'Бонус',
  penalty: 'Штраф',
  submission_revoked: 'Отмена начисления',
};

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await requireTeamSession();
  const params = await searchParams;
  const db = supabaseAdmin();

  const [membersResult, progressResult, transactionsResult, standing] = await Promise.all([
    db
      .from('team_members')
      .select('*')
      .eq('team_id', session.teamId)
      .order('is_captain', { ascending: false })
      .order('created_at', { ascending: true }),
    db.from('team_progress').select('*').eq('team_id', session.teamId).maybeSingle(),
    db
      .from('score_transactions')
      .select('*')
      .eq('team_id', session.teamId)
      .order('created_at', { ascending: false })
      .limit(8),
    getTeamStanding(session.event, session.teamId),
  ]);

  const members = (membersResult.data as TeamMemberRow[] | null) ?? [];
  const progress = progressResult.data as TeamProgressRow | null;
  const transactions = (transactionsResult.data as ScoreTransactionRow[] | null) ?? [];

  const isCaptain = session.member?.is_captain ?? false;
  const started = ['live', 'paused', 'finished', 'archived'].includes(session.event.status);
  const leaderboardVisible = session.event.leaderboard_mode !== 'hidden';

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {params.welcome === '1' && (
          <Notice tone="strong" icon="✓" role="status">
            Команда создана. Передайте код остальным участникам — до {session.event.team_size}{' '}
            человек, включая вас.
          </Notice>
        )}

        <header className="flex flex-col gap-3">
          <Eyebrow>{EVENT_STATUS_TEXT[session.event.status] ?? session.event.status}</Eyebrow>
          <h1 className="text-heading md:text-heading-lg">{session.team.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{TEAM_STATUS_TEXT[session.team.status]}</Tag>
            {session.team.payment_confirmed ? (
              <Tag>оплата подтверждена</Tag>
            ) : (
              <Tag>оплата не подтверждена</Tag>
            )}
            {session.member && <Tag>вы — {isCaptain ? 'капитан' : 'участник'}</Tag>}
          </div>
        </header>

        {/* ═══ До старта ════════════════════════════════════ */}
        {!started && (
          <Card className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-caption text-sepia">
              Старт {formatEventDateLong(session.event)} в {formatEventTime(session.event)}
            </p>
            <Countdown target={session.event.starts_at} status={session.event.status} />
            <p className="max-w-prose text-body text-sepia">
              Задания откроются автоматически. До старта можно собрать команду и прочитать
              правила.
            </p>
          </Card>
        )}

        {/* ═══ Код команды ══════════════════════════════════ */}
        <JoinCodeCard
          joinCode={session.team.join_code}
          isCaptain={isCaptain}
          started={started}
          teamSize={session.event.team_size}
          membersCount={members.length}
        />

        {/* ═══ Счёт и место ═════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="flex flex-col gap-1">
            <p className="text-caption text-sepia">Баллы</p>
            <p className="text-heading tracking-[-1.32px] tabular-nums">
              {standing?.totalPoints ?? 0}
            </p>
            <p className="text-caption text-sand">{pointsWord(standing?.totalPoints ?? 0)}</p>
          </Card>

          <Card className="flex flex-col gap-1">
            <p className="text-caption text-sepia">Место</p>
            <p className="text-heading tracking-[-1.32px] tabular-nums">
              {leaderboardVisible && standing ? standing.position : '—'}
            </p>
            <p className="text-caption text-sand">
              {leaderboardVisible && standing ? `из ${standing.totalTeams}` : 'рейтинг скрыт'}
            </p>
          </Card>
        </div>

        {/* ═══ Прогресс ═════════════════════════════════════ */}
        {started && progress && (
          <Card className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-subheading">Прогресс</h2>
              <p className="text-body text-sepia">
                {progress.accepted} из {progress.tasks_total} {tasksWord(progress.tasks_total)}
              </p>
            </div>

            {/* Полоса выполнения. Числа рядом — на случай, если
                визуальный индикатор недоступен. */}
            <div
              className="h-2 w-full overflow-hidden rounded-[9999px] bg-ink-wash"
              role="progressbar"
              aria-valuenow={progress.accepted}
              aria-valuemin={0}
              aria-valuemax={progress.tasks_total}
              aria-label="Принятых заданий"
            >
              <div
                className="h-full bg-ink"
                style={{
                  width: `${progress.tasks_total > 0 ? (progress.accepted / progress.tasks_total) * 100 : 0}%`,
                }}
              />
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Принято', progress.accepted],
                ['На проверке', progress.pending + progress.checking],
                ['Ручная проверка', progress.manual_review],
                ['Отклонено', progress.rejected],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex flex-col">
                  <dt className="text-caption text-sepia">{label}</dt>
                  <dd className="text-subheading tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <ButtonLink href="/tasks" size="sm" className="self-start">
              К заданиям
            </ButtonLink>
          </Card>
        )}

        {/* ═══ Состав ═══════════════════════════════════════ */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-subheading">Состав</h2>
            <p className="text-caption text-sepia">
              {members.length} из {session.event.team_size} {membersWord(session.event.team_size)}
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 border-b border-hairline pb-2 last:border-0 last:pb-0"
              >
                <span className="text-body">
                  {member.name}
                  {member.id === session.memberId && (
                    <span className="ml-2 text-caption text-sepia">— это вы</span>
                  )}
                </span>
                {member.is_captain && <Tag>капитан</Tag>}
              </li>
            ))}
          </ul>

          {isCaptain && !started && (
            <Link href="/team/members" className="text-caption underline underline-offset-2">
              Управлять составом
            </Link>
          )}
        </Card>

        {/* ═══ Последние начисления ═════════════════════════ */}
        {transactions.length > 0 && (
          <Card className="flex flex-col gap-3">
            <h2 className="text-subheading">Последние изменения баллов</h2>
            <ul className="flex flex-col gap-2">
              {transactions.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-start justify-between gap-3 border-b border-hairline pb-2 text-body last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p>{TRANSACTION_LABEL[tx.transaction_type] ?? tx.transaction_type}</p>
                    {tx.reason && <p className="text-caption text-sepia">{tx.reason}</p>}
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {tx.points > 0 ? `+${tx.points}` : tx.points}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex justify-between gap-3 pt-2">
          <ButtonLink href="/submissions" variant="secondary" size="sm">
            Наши отправки
          </ButtonLink>
          <LogoutButton />
        </div>
      </div>

      {/* Пока есть отправки в работе, экран обновляется сам. */}
      <LiveRefresh active={(progress?.in_review ?? 0) > 0} />
      <BottomNav />
    </div>
  );
}
