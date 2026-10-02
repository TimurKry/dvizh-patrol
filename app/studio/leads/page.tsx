import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/surface';
import { EmptyState } from '@/components/ui/feedback';
import { Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import {
  countLeadsByStatus,
  listLeads,
  listStaff,
  parseLeadFilter,
  staffLabel,
  type LeadFilter,
} from '@/lib/data/leads';
import {
  LEAD_FUNNEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  OPEN_LEAD_STATUSES,
  PARTICIPANTS_LABEL,
  SCENARIO_LABEL,
  ageLabel,
  formatEventDate,
  labelOf,
} from '@/lib/studio/leads';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Заявки' };

export default async function StudioLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireAdmin();
  const filter = parseLeadFilter((await searchParams).status);

  const [leads, counts, staff] = await Promise.all([
    listLeads(filter),
    countLeadsByStatus(),
    listStaff(),
  ]);
  const staffById = new Map(staff.map((m) => [m.userId, m]));

  const openCount = OPEN_LEAD_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const allCount = LEAD_FUNNEL.reduce((sum, s) => sum + counts[s], 0);

  const tabs: Array<{ value: LeadFilter; label: string; count: number }> = [
    { value: 'open', label: 'В работе', count: openCount },
    ...LEAD_FUNNEL.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s], count: counts[s] })),
    { value: 'all', label: 'Все', count: allCount },
  ];

  return (
    <div className="page-well flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Студия</Eyebrow>
          <h1 className="mt-2 text-headline">Заявки</h1>
        </div>
        <ButtonLink href="/studio/leads/new" size="sm">
          Добавить заявку
        </ButtonLink>
      </header>

      {/* ═══ Воронка ═════════════════════════════════════════ */}
      <nav aria-label="Этапы воронки" className="scroll-x -mx-1 px-1">
        <ul className="flex gap-1">
          {tabs.map((tab) => {
            const active = tab.value === filter;
            return (
              <li key={tab.value}>
                <Link
                  href={
                    tab.value === 'open' ? '/studio/leads' : `/studio/leads?status=${tab.value}`
                  }
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-caption transition-colors',
                    active
                      ? 'border-ink bg-signal text-canvas font-medium'
                      : 'border-hairline bg-panel text-muted hover:text-ink',
                  )}
                >
                  {tab.label}
                  <span className="tabular-nums">{tab.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ═══ Список ══════════════════════════════════════════ */}
      {leads.length === 0 ? (
        <EmptyState
          title="Здесь пусто"
          description={
            filter === 'open'
              ? 'Новые заявки с сайта появятся здесь сами. Заявку из Telegram можно добавить вручную.'
              : 'В этом статусе заявок нет.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map((lead) => {
            const facts = [
              lead.city,
              labelOf(SCENARIO_LABEL, lead.scenario),
              lead.participants_range &&
                `${labelOf(PARTICIPANTS_LABEL, lead.participants_range)} чел.`,
              lead.event_date && formatEventDate(lead.event_date),
            ].filter(Boolean);
            const assignee = staffLabel(
              lead.assignee_id ? staffById.get(lead.assignee_id) : undefined,
            );

            return (
              <li key={lead.id}>
                <Link href={`/studio/leads/${lead.id}`} className="block">
                  <Card interactive className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-title-sm">{lead.name}</span>
                      <Tag emphasis={lead.status === 'new'}>{LEAD_STATUS_LABEL[lead.status]}</Tag>
                    </div>
                    {facts.length > 0 && (
                      <p className="text-body text-muted">{facts.join(' · ')}</p>
                    )}
                    <p className="text-caption text-faint">
                      {LEAD_SOURCE_LABEL[lead.source]} · {ageLabel(lead.created_at)}
                      {assignee ? ` · ${assignee}` : ' · без ответственного'}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
