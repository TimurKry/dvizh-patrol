import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton, ActionForm } from '@/components/admin/action-form';
import { adjustScoreAction, updateTeamAction } from '@/actions/admin';
import { Card, Eyebrow } from '@/components/ui/surface';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { TEAM_STATUS_TEXT, pointsWord } from '@/lib/messages';
import type {
  ConsentRow,
  EventRow,
  ScoreTransactionRow,
  SubmissionRow,
  TaskRow,
  TeamMemberRow,
  TeamRow,
} from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Команда' };

const TRANSACTION_LABEL: Record<string, string> = {
  task_accepted: 'Задание принято',
  manual_adjustment: 'Корректировка',
  bonus: 'Бонус',
  penalty: 'Штраф',
  submission_revoked: 'Отмена начисления',
};

export default async function AdminTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireAdmin();
  const { teamId } = await params;

  const db = supabaseAdmin();
  const { data: teamData } = await db.from('teams').select('*').eq('id', teamId).maybeSingle();
  const team = teamData as TeamRow | null;
  if (!team) notFound();

  const [eventResult, membersResult, scoreResult, txResult, submissionsResult, consentsResult] =
    await Promise.all([
      db.from('events').select('*').eq('id', team.event_id).maybeSingle(),
      db
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .order('is_captain', { ascending: false }),
      db.from('team_scores').select('*').eq('team_id', teamId).maybeSingle(),
      db
        .from('score_transactions')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false }),
      db
        .from('submissions')
        .select('*, tasks:task_id (number, title)')
        .eq('team_id', teamId)
        .not('status', 'in', '("draft","uploading")')
        .order('submitted_at', { ascending: false }),
      db.from('consents').select('*').eq('team_id', teamId),
    ]);

  const event = eventResult.data as EventRow | null;
  const members = (membersResult.data as TeamMemberRow[] | null) ?? [];
  const score = scoreResult.data as { total_points: number; accepted_count: number } | null;
  const transactions = (txResult.data as ScoreTransactionRow[] | null) ?? [];
  const submissions =
    (submissionsResult.data as Array<
      SubmissionRow & { tasks: Pick<TaskRow, 'number' | 'title'> | null }
    > | null) ?? [];
  const consents = (consentsResult.data as ConsentRow[] | null) ?? [];

  const canDelete = event?.status === 'registration' || event?.status === 'draft';
  const socialAllowed = consents.filter((c) => c.social_publication_consent).length;

  return (
    <div className="page-well flex max-w-4xl flex-col gap-8 py-8">
      <div>
        <Link href="/admin/teams" className="text-caption text-sepia hover:text-ink">
          ← Все команды
        </Link>
        <Eyebrow className="mt-4">{TEAM_STATUS_TEXT[team.status]}</Eyebrow>
        <h1 className="mt-2 text-heading">{team.name}</h1>
        <p className="mt-1 text-body text-sepia">
          Капитан: {team.captain_name}
          {team.contact && ` · ${team.contact}`}
        </p>
      </div>

      {/* ═══ Быстрые действия ═══════════════════════════════ */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-subheading">Действия</h2>

        <div className="flex flex-wrap gap-3">
          {team.payment_confirmed ? (
            <ActionButton
              action={updateTeamAction}
              values={{ teamId: team.id, action: 'revoke_payment' }}
            >
              Снять подтверждение оплаты
            </ActionButton>
          ) : (
            <ActionButton
              action={updateTeamAction}
              values={{ teamId: team.id, action: 'confirm_payment' }}
              variant="primary"
            >
              Подтвердить оплату
            </ActionButton>
          )}

          <ActionButton
            action={updateTeamAction}
            values={{ teamId: team.id, action: 'regenerate_code' }}
            confirm="Сгенерировать новый код? Старый перестанет работать."
          >
            Новый код приглашения
          </ActionButton>

          <ActionButton
            action={updateTeamAction}
            values={{ teamId: team.id, action: 'reset_sessions' }}
            confirm="Отозвать все сессии команды? Участникам придётся войти заново."
          >
            Сбросить сессии
          </ActionButton>

          {team.status === 'cancelled' ? (
            <ActionButton
              action={updateTeamAction}
              values={{ teamId: team.id, action: 'restore' }}
            >
              Вернуть команду
            </ActionButton>
          ) : (
            <ActionButton
              action={updateTeamAction}
              values={{ teamId: team.id, action: 'cancel' }}
              variant="danger"
              confirm={
                canDelete
                  ? 'Отменить регистрацию? Место освободится для другой команды.'
                  : 'Квест уже идёт. Отменить регистрацию команды?'
              }
            >
              Отменить регистрацию
            </ActionButton>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <span className="text-caption text-sepia">Код:</span>
          <code className="rounded-[8px] bg-ink-wash px-2 py-1 font-mono tabular-nums">
            {team.join_code}
          </code>
        </div>

        <ActionForm
          action={updateTeamAction}
          submitLabel="Переименовать"
          variant="secondary"
          className="flex flex-col gap-3 border-t border-hairline pt-4"
        >
          {(fields) => (
            <>
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="action" value="rename" />
              <Field label="Новое название" htmlFor="team-name" error={fields.name}>
                <TextInput id="team-name" name="name" defaultValue={team.name} maxLength={60} />
              </Field>
            </>
          )}
        </ActionForm>
      </Card>

      {/* ═══ Баллы ══════════════════════════════════════════ */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-subheading">Баллы</h2>
          <p className="text-heading-sm tabular-nums">
            {score?.total_points ?? 0}{' '}
            <span className="text-caption text-sepia">
              {pointsWord(score?.total_points ?? 0)}
            </span>
          </p>
        </div>

        <ActionForm
          action={adjustScoreAction}
          submitLabel="Начислить"
          className="flex flex-col gap-4"
        >
          {(fields) => (
            <>
              <input type="hidden" name="teamId" value={team.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Тип" htmlFor="tx-type" error={fields.transactionType}>
                  <Select id="tx-type" name="transactionType" defaultValue="bonus">
                    <option value="bonus">Бонус</option>
                    <option value="penalty">Штраф</option>
                    <option value="manual_adjustment">Корректировка</option>
                  </Select>
                </Field>
                <Field
                  label="Баллы"
                  htmlFor="tx-points"
                  error={fields.points}
                  hint="Для штрафа знак поставится сам."
                >
                  <TextInput id="tx-points" name="points" type="number" defaultValue="10" />
                </Field>
                <Field label="Причина" htmlFor="tx-reason" required error={fields.reason}>
                  <TextInput id="tx-reason" name="reason" required maxLength={300} />
                </Field>
              </div>
            </>
          )}
        </ActionForm>

        {transactions.length > 0 && (
          <div className="border-t border-hairline pt-4">
            <h3 className="mb-3 text-caption font-medium uppercase tracking-[0.08em] text-sepia">
              Журнал начислений
            </h3>
            <ul className="flex flex-col gap-2">
              {transactions.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-start justify-between gap-3 border-b border-hairline pb-2 text-body last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p>
                      {TRANSACTION_LABEL[tx.transaction_type] ?? tx.transaction_type}
                      {tx.reversed_by_transaction_id && (
                        <span className="ml-2 text-caption text-sepia">— отменено</span>
                      )}
                    </p>
                    {tx.reason && <p className="text-caption text-sepia">{tx.reason}</p>}
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {tx.points > 0 ? `+${tx.points}` : tx.points}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* ═══ Состав ═════════════════════════════════════════ */}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-subheading">Состав</h2>
          <p className="text-caption text-sepia">
            {members.length} из {event?.team_size ?? 4}
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 border-b border-hairline pb-2 text-body last:border-0 last:pb-0"
            >
              <span>{member.name}</span>
              {member.is_captain && <Tag>капитан</Tag>}
            </li>
          ))}
        </ul>

        <Notice icon="•" className="mt-2">
          Согласие на публикацию в социальных сетях дали {socialAllowed} из {consents.length}.
          Фотографии остальных публиковать нельзя.
        </Notice>
      </Card>

      {/* ═══ Отправки ═══════════════════════════════════════ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-subheading">Отправки ({submissions.length})</h2>
        {submissions.length === 0 ? (
          <p className="text-body text-sepia">Команда пока ничего не отправляла.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {submissions.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/admin/submissions/${row.id}`}
                  className="flex items-center justify-between gap-4 rounded-[16px] border border-hairline bg-paper px-4 py-3 hover:border-hairline-strong"
                >
                  <span className="min-w-0 truncate text-body">
                    {row.tasks ? `${row.tasks.number}. ${row.tasks.title}` : 'Задание удалено'}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {row.awarded_points > 0 && (
                      <span className="text-caption tabular-nums text-sepia">
                        +{row.awarded_points}
                      </span>
                    )}
                    <StatusBadge status={row.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
