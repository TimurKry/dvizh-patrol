import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/admin/action-form';
import { Card, Eyebrow } from '@/components/ui/surface';
import { Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Tag } from '@/components/ui/status-badge';
import { addLeadNoteAction, assignLeadAction, updateLeadStatusAction } from '@/actions/studio';
import { requireRole } from '@/lib/auth/admin';
import { CRM_ROLES } from '@/lib/studio/staff';
import { getLead, listLeadActivities, listStaff, staffLabel } from '@/lib/data/leads';
import {
  LEAD_FUNNEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  PARTICIPANTS_LABEL,
  SCENARIO_LABEL,
  TICKET_PRICE_LABEL,
  contactLinks,
  formatEventDate,
  formatLeadDateTime,
  labelOf,
} from '@/lib/studio/leads';
import type { LeadActivityRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Заявка' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function activityText(activity: LeadActivityRow): string {
  switch (activity.kind) {
    case 'created':
      return 'Заявка создана';
    case 'status': {
      const from = activity.from_status ? LEAD_STATUS_LABEL[activity.from_status] : '—';
      const to = activity.to_status ? LEAD_STATUS_LABEL[activity.to_status] : '—';
      return `Статус: ${from} → ${to}${activity.body ? `. Причина: ${activity.body}` : ''}`;
    }
    case 'assignee':
      return activity.body ? `Ответственный: ${activity.body}` : 'Ответственный снят';
    case 'note':
      return activity.body ?? '';
  }
}

export default async function StudioLeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  await requireRole(...CRM_ROLES);
  const { leadId } = await params;
  if (!UUID.test(leadId)) notFound();

  const [lead, activities, staff] = await Promise.all([
    getLead(leadId),
    listLeadActivities(leadId),
    listStaff(),
  ]);
  if (!lead) notFound();

  const links = contactLinks(lead.messenger, lead.email);
  const assignee = staffLabel(staff.find((m) => m.userId === lead.assignee_id));

  const details: Array<[string, string | null]> = [
    ['Город', lead.city],
    ['Игра', labelOf(SCENARIO_LABEL, lead.scenario)],
    ['Участников', labelOf(PARTICIPANTS_LABEL, lead.participants_range)],
    ['Билет', labelOf(TICKET_PRICE_LABEL, lead.ticket_price_range)],
    ['Дата ивента', lead.event_date && formatEventDate(lead.event_date)],
    ['Мессенджер', lead.messenger],
    ['Email', lead.email],
    ['Источник', LEAD_SOURCE_LABEL[lead.source]],
    ['Поступила', formatLeadDateTime(lead.created_at)],
    [
      'UTM',
      [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ') || null,
    ],
  ];

  return (
    <div className="page-well flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-3">
        <Link href="/studio/leads" className="text-caption text-muted hover:text-ink">
          ← Все заявки
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-headline">{lead.name}</h1>
          <Tag emphasis={lead.status === 'new'}>{LEAD_STATUS_LABEL[lead.status]}</Tag>
        </div>
        <p className="text-caption text-muted">
          {assignee ? `Ответственный: ${assignee}` : 'Ответственный не назначен'}
        </p>

        {/* ═══ Написать ═══════════════════════════════════════ */}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target={link.kind === 'email' ? undefined : '_blank'}
                rel="noopener noreferrer"
                className={
                  link.kind === 'email'
                    ? 'inline-flex min-h-[44px] items-center border border-hairline-strong bg-panel px-4 text-body hover:border-signal hover:text-signal'
                    : 'inline-flex min-h-[44px] items-center border border-signal bg-signal px-4 text-body font-medium text-canvas hover:bg-signal-deep'
                }
              >
                {link.kind === 'email'
                  ? 'Email'
                  : `Написать в ${link.kind === 'telegram' ? 'Telegram' : 'WhatsApp'}`}
              </a>
            ))}
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {/* ═══ Бриф ═══════════════════════════════════════ */}
          <Card className="flex flex-col gap-4 p-5">
            <Eyebrow>Бриф</Eyebrow>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              {details
                .filter(([, value]) => value)
                .map(([term, value]) => (
                  <div key={term} className="contents">
                    <dt className="text-muted">{term}</dt>
                    <dd className="break-words">{value}</dd>
                  </div>
                ))}
            </dl>
            {lead.notes && (
              <div className="flex flex-col gap-1">
                <p className="text-caption text-muted">Комментарий клиента</p>
                <p className="whitespace-pre-line text-body">{lead.notes}</p>
              </div>
            )}
          </Card>

          {/* ═══ Управление ═════════════════════════════════ */}
          <Card className="flex flex-col gap-4 p-5">
            <Eyebrow>Статус</Eyebrow>
            <ActionForm
              action={updateLeadStatusAction}
              submitLabel="Сменить статус"
              variant="secondary"
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="leadId" value={lead.id} />
              <Field label="Этап воронки" htmlFor="lead-status" name="status">
                <Select id="lead-status" name="status" defaultValue={lead.status}>
                  {LEAD_FUNNEL.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Причина отказа"
                htmlFor="lead-lost-reason"
                name="lostReason"
                hint="Только для статуса «Отказ»: дорого, не та дата, пропал…"
              >
                <TextInput
                  id="lead-lost-reason"
                  name="lostReason"
                  maxLength={500}
                  defaultValue={lead.lost_reason ?? ''}
                />
              </Field>
            </ActionForm>
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <Eyebrow>Ответственный</Eyebrow>
            <ActionForm
              action={assignLeadAction}
              submitLabel="Назначить"
              variant="secondary"
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="leadId" value={lead.id} />
              <Field label="Кто ведёт заявку" htmlFor="lead-assignee" name="assigneeId">
                <Select id="lead-assignee" name="assigneeId" defaultValue={lead.assignee_id ?? ''}>
                  <option value="">Никто</option>
                  {staff.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name ?? m.email}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </Card>
        </div>

        {/* ═══ Лента ══════════════════════════════════════════ */}
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <Eyebrow>Заметка</Eyebrow>
            <ActionForm
              action={addLeadNoteAction}
              submitLabel="Добавить заметку"
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="leadId" value={lead.id} />
              <Field label="Что обсудили" htmlFor="lead-note" name="body">
                <TextArea id="lead-note" name="body" required maxLength={4000} />
              </Field>
            </ActionForm>
          </Card>

          {activities.length > 0 && (
            <ol className="flex flex-col gap-3" aria-label="История заявки">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex flex-col gap-1 border-l-2 border-hairline-strong pl-4"
                >
                  <p className="text-caption text-faint">
                    {formatLeadDateTime(activity.created_at)}
                    {activity.author_email ? ` · ${activity.author_email}` : ''}
                  </p>
                  <p
                    className={
                      activity.kind === 'note'
                        ? 'whitespace-pre-line text-body'
                        : 'text-body text-muted'
                    }
                  >
                    {activityText(activity)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
