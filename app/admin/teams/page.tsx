import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/admin/action-form';
import { createTeamAction } from '@/actions/admin';
import { Card, Eyebrow } from '@/components/ui/surface';
import { Field, TextInput } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/feedback';
import { Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent, getRegistrationStats } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { TEAM_STATUS_TEXT, membersWord, pointsWord } from '@/lib/messages';
import type { TeamRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Команды' };

export default async function AdminTeamsPage() {
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
  const [teamsResult, membersResult, scoresResult, stats] = await Promise.all([
    db.from('teams').select('*').eq('event_id', event.id).order('created_at', { ascending: true }),
    db.from('team_members').select('id, team_id'),
    db.from('team_scores').select('team_id, total_points, accepted_count'),
    getRegistrationStats(event),
  ]);

  const teams = (teamsResult.data as TeamRow[] | null) ?? [];
  const members = (membersResult.data as Array<{ team_id: string }> | null) ?? [];
  const scores =
    (scoresResult.data as Array<{
      team_id: string;
      total_points: number;
      accepted_count: number;
    }> | null) ?? [];

  const memberCount = new Map<string, number>();
  for (const member of members) {
    memberCount.set(member.team_id, (memberCount.get(member.team_id) ?? 0) + 1);
  }

  const scoreByTeam = new Map(scores.map((s) => [s.team_id, s]));

  return (
    <div className="page-well flex flex-col gap-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Управление</Eyebrow>
          <h1 className="mt-2 text-headline">Команды</h1>
        </div>

        <dl className="flex flex-wrap gap-4 text-caption">
          {[
            ['Зарегистрировано', `${stats.active} / ${event.max_teams}`],
            ['Подтверждено', String(stats.confirmed)],
            ['Ожидают', String(stats.pending)],
            ['Свободно мест', String(stats.free)],
            ['Участников', `${stats.members} / ${event.max_teams * event.team_size}`],
          ].map(([term, value]) => (
            <div key={term} className="flex flex-col">
              <dt className="text-muted">{term}</dt>
              <dd className="text-body tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* ═══ Список ═════════════════════════════════════════ */}
      {teams.length === 0 ? (
        <EmptyState title="Команд пока нет" description="Они появятся здесь после регистрации." />
      ) : (
        <div className="scroll-x">
          <table className="w-full min-w-[720px] border-collapse text-body">
            <caption className="sr-only">Список зарегистрированных команд</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-caption text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Команда
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Код
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Капитан
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Состав
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Статус
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Оплата
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Баллы
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const score = scoreByTeam.get(team.id);
                const count = memberCount.get(team.id) ?? 0;
                return (
                  <tr key={team.id} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/teams/${team.id}`}
                        className="underline underline-offset-2"
                      >
                        {team.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 font-mono text-caption tabular-nums">
                      {team.join_code}
                    </td>
                    <td className="py-3 pr-4 text-muted">{team.captain_name}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {count} / {team.size_limit ?? event.team_size}
                      {team.size_limit !== null && (
                        <span className="ml-1 text-caption text-muted">своё</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Tag emphasis={team.status === 'confirmed'}>
                        {TEAM_STATUS_TEXT[team.status]}
                      </Tag>
                    </td>
                    <td className="py-3 pr-4 text-caption text-muted">
                      {team.payment_confirmed ? 'подтверждена' : '—'}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {score?.total_points ?? 0}
                      <span className="ml-1 text-caption text-muted">
                        {pointsWord(score?.total_points ?? 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Создание вручную ═══════════════════════════════ */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-body-lg">Создать команду вручную</h2>
        <p className="text-body text-muted">
          Пригодится, если команда зарегистрировалась офлайн. Лимит {event.max_teams} соблюдается,
          окно регистрации — нет.
        </p>

        <ActionForm
          action={createTeamAction}
          submitLabel="Создать команду"
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="eventId" value={event.id} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Название" htmlFor="new-name" name="name" required>
              <TextInput id="new-name" name="name" required maxLength={60} />
            </Field>
            <Field label="Капитан" htmlFor="new-captain" name="captainName" required>
              <TextInput id="new-captain" name="captainName" required maxLength={60} />
            </Field>
            <Field label="Контакт" htmlFor="new-contact" name="contact">
              <TextInput id="new-contact" name="contact" maxLength={200} />
            </Field>
            {/* Своё число сразу при создании: у одной компании
                шестеро, у остальных четверо, и переоткрывать
                карточку ради этого не хочется. */}
            <Field
              label="Человек в команде"
              htmlFor="new-size"
              name="sizeLimit"
              hint={`Пусто — как у всех: ${event.team_size}.`}
            >
              <TextInput
                id="new-size"
                name="sizeLimit"
                type="number"
                min="1"
                max="6"
                placeholder={String(event.team_size)}
              />
            </Field>
          </div>
        </ActionForm>

        <p className="text-caption text-muted">
          По умолчанию в команде до {event.team_size} {membersWord(event.team_size)}. Своё число
          можно поставить здесь или потом в карточке команды.
        </p>
      </Card>
    </div>
  );
}
