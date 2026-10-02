'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { audit, requireRole, type AdminContext } from '@/lib/auth/admin';
import { CRM_ROLES } from '@/lib/studio/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  fieldErrors,
  leadAssigneeSchema,
  leadCreateSchema,
  leadNoteSchema,
  leadStatusSchema,
} from '@/lib/validation/schemas';
import type { LeadActivityKind, LeadRow, LeadStatus } from '@/types/database';
import type { AdminActionState } from '@/actions/admin';

/**
 * Действия Студии над заявками.
 *
 * Как и в админке игры: каждое начинается с проверки роли, каждое
 * изменение оставляет след. Здесь след двойной — строка в ленте
 * заявки (её читает менеджер) и запись в общем журнале (его
 * читают, когда разбираются, что пошло не так).
 */

async function addActivity(
  admin: AdminContext,
  leadId: string,
  kind: LeadActivityKind,
  fields: { body?: string | null; fromStatus?: LeadStatus | null; toStatus?: LeadStatus | null },
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('lead_activities')
    .insert({
      lead_id: leadId,
      kind,
      body: fields.body ?? null,
      from_status: fields.fromStatus ?? null,
      to_status: fields.toStatus ?? null,
      author_id: admin.userId,
      author_email: admin.email,
    });
  if (error) throw new Error(`lead_activities insert failed: ${error.message}`);
}

async function loadLead(leadId: string): Promise<LeadRow | null> {
  const { data } = await supabaseAdmin().from('leads').select('*').eq('id', leadId).maybeSingle();
  return (data as LeadRow | null) ?? null;
}

function refresh(leadId: string): void {
  revalidatePath('/studio/leads');
  revalidatePath(`/studio/leads/${leadId}`);
}

// ═══ Создание ══════════════════════════════════════════════════

/** Заявка из переписки в Telegram или со звонка. Сайт пишет сам. */
export async function createLeadAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireRole(...CRM_ROLES);

  const parsed = leadCreateSchema.safeParse({
    name: formData.get('name') ?? '',
    source: formData.get('source') ?? 'telegram',
    messenger: formData.get('messenger') ?? '',
    email: formData.get('email') ?? '',
    city: formData.get('city') ?? '',
    scenario: formData.get('scenario') ?? '',
    participantsRange: formData.get('participantsRange') ?? '',
    eventDate: formData.get('eventDate') ?? '',
    notes: formData.get('notes') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  const v = parsed.data;
  const { data, error } = await supabaseAdmin()
    .from('leads')
    .insert({
      source: v.source,
      name: v.name,
      messenger: v.messenger,
      email: v.email,
      city: v.city,
      scenario: v.scenario,
      participants_range: v.participantsRange,
      event_date: v.eventDate,
      notes: v.notes,
      assignee_id: admin.userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, message: 'Не удалось сохранить заявку.' };
  }

  const leadId = (data as { id: string }).id;
  await addActivity(admin, leadId, 'created', { toStatus: 'new' });
  await audit({ admin, action: 'lead_created', entityType: 'lead', entityId: leadId, after: v });

  revalidatePath('/studio/leads');
  redirect(`/studio/leads/${leadId}`);
}

// ═══ Статус ════════════════════════════════════════════════════

export async function updateLeadStatusAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireRole(...CRM_ROLES);

  const parsed = leadStatusSchema.safeParse({
    leadId: formData.get('leadId'),
    status: formData.get('status'),
    lostReason: formData.get('lostReason') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  const { leadId, status, lostReason } = parsed.data;
  const lead = await loadLead(leadId);
  if (!lead) return { ok: false, message: 'Заявка не найдена.' };
  if (lead.status === status) return { ok: true, message: 'Статус не изменился.' };

  const { error } = await supabaseAdmin()
    .from('leads')
    .update({
      status,
      status_changed_at: new Date().toISOString(),
      // Причина отказа живёт, пока заявка в отказе; вернули в работу — стёрли.
      lost_reason: status === 'lost' ? lostReason : null,
    })
    .eq('id', leadId);

  if (error) return { ok: false, message: 'Не удалось сменить статус.' };

  await addActivity(admin, leadId, 'status', {
    fromStatus: lead.status,
    toStatus: status,
    body: status === 'lost' ? lostReason : null,
  });
  await audit({
    admin,
    action: 'lead_status_changed',
    entityType: 'lead',
    entityId: leadId,
    before: { status: lead.status },
    after: { status, lostReason },
  });

  refresh(leadId);
  return { ok: true, message: 'Статус обновлён.' };
}

// ═══ Ответственный ═════════════════════════════════════════════

export async function assignLeadAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireRole(...CRM_ROLES);

  const parsed = leadAssigneeSchema.safeParse({
    leadId: formData.get('leadId'),
    assigneeId: formData.get('assigneeId') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  const { leadId, assigneeId } = parsed.data;
  const lead = await loadLead(leadId);
  if (!lead) return { ok: false, message: 'Заявка не найдена.' };
  if (lead.assignee_id === assigneeId) return { ok: true, message: 'Без изменений.' };

  let assigneeEmail: string | null = null;
  if (assigneeId) {
    const { data } = await supabaseAdmin()
      .from('admin_users')
      .select('email')
      .eq('user_id', assigneeId)
      .is('disabled_at', null)
      .in('role', [...CRM_ROLES])
      .maybeSingle();
    if (!data) return { ok: false, message: 'Такого сотрудника нет.' };
    assigneeEmail = (data as { email: string }).email;
  }

  const { error } = await supabaseAdmin()
    .from('leads')
    .update({ assignee_id: assigneeId })
    .eq('id', leadId);
  if (error) return { ok: false, message: 'Не удалось назначить ответственного.' };

  await addActivity(admin, leadId, 'assignee', { body: assigneeEmail });
  await audit({
    admin,
    action: 'lead_assigned',
    entityType: 'lead',
    entityId: leadId,
    before: { assigneeId: lead.assignee_id },
    after: { assigneeId },
  });

  refresh(leadId);
  return {
    ok: true,
    message: assigneeEmail ? `Ответственный: ${assigneeEmail}` : 'Ответственный снят.',
  };
}

// ═══ Заметка ═══════════════════════════════════════════════════

export async function addLeadNoteAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireRole(...CRM_ROLES);

  const parsed = leadNoteSchema.safeParse({
    leadId: formData.get('leadId'),
    body: formData.get('body') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  const lead = await loadLead(parsed.data.leadId);
  if (!lead) return { ok: false, message: 'Заявка не найдена.' };

  try {
    await addActivity(admin, lead.id, 'note', { body: parsed.data.body });
  } catch {
    return { ok: false, message: 'Не удалось сохранить заметку.' };
  }

  refresh(lead.id);
  return { ok: true, message: 'Заметка добавлена.' };
}
