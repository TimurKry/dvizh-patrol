import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/nav/bottom-nav';
import { RemoveMemberButton } from '@/components/game/remove-member-button';
import { Card, Eyebrow } from '@/components/ui/surface';
import { Notice } from '@/components/ui/feedback';
import { Tag } from '@/components/ui/status-badge';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireTeamSession } from '@/lib/session/require';
import { membersWord } from '@/lib/messages';
import type { TeamMemberRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Состав команды' };

export default async function TeamMembersPage() {
  const session = await requireTeamSession();

  // Управление составом — только капитану и только до старта.
  if (!session.member?.is_captain) redirect('/team');

  const { data } = await supabaseAdmin()
    .from('team_members')
    .select('*')
    .eq('team_id', session.teamId)
    .order('is_captain', { ascending: false })
    .order('created_at', { ascending: true });

  const members = (data as TeamMemberRow[] | null) ?? [];
  const editable = session.event.status === 'registration';

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Link
          href="/team"
          className="inline-flex items-center gap-2 text-caption text-muted hover:text-ink"
        >
          <span aria-hidden="true">←</span> Команда
        </Link>

        <header className="flex flex-col gap-2">
          <Eyebrow>Капитан</Eyebrow>
          <h1 className="text-headline">Состав команды</h1>
          <p className="text-body text-muted">
            {members.length} из {session.event.team_size} {membersWord(session.event.team_size)}
          </p>
        </header>

        {!editable && (
          <Notice icon="info">
            Квест уже начался — состав команды зафиксирован. Изменения возможны только через
            организатора.
          </Notice>
        )}

        <Card className="flex flex-col gap-3">
          <ul className="flex flex-col gap-3">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-body">{member.name}</p>
                  {member.id === session.memberId && (
                    <p className="text-caption text-muted">это вы</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {member.is_captain ? (
                    <Tag>капитан</Tag>
                  ) : editable ? (
                    <RemoveMemberButton memberId={member.id} memberName={member.name} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <p className="text-caption text-muted">
          Удалённый участник теряет доступ немедленно. Войти заново он сможет по коду команды, если
          останутся свободные места.
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
