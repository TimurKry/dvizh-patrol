import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  LEAD_STATUSES,
  type LeadActivityRow,
  type LeadRow,
  type LeadStatus,
} from '@/types/database';
import { OPEN_LEAD_STATUSES } from '@/lib/studio/leads';
import { CRM_ROLES } from '@/lib/studio/staff';

/**
 * Чтение заявок для Студии.
 *
 * Объёмы — десятки, в лучшем случае сотни заявок в год, поэтому
 * без пагинации: весь срез читается одним запросом, а счётчики
 * воронки — вторым, по одной колонке.
 */

export type LeadFilter = LeadStatus | 'open' | 'all';

export function parseLeadFilter(value: string | string[] | undefined): LeadFilter {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === 'all') return 'all';
  if (v && (LEAD_STATUSES as readonly string[]).includes(v)) return v as LeadStatus;
  return 'open';
}

export async function listLeads(filter: LeadFilter): Promise<LeadRow[]> {
  let query = supabaseAdmin().from('leads').select('*').order('created_at', { ascending: false });

  if (filter === 'open') query = query.in('status', [...OPEN_LEAD_STATUSES]);
  else if (filter !== 'all') query = query.eq('status', filter);

  const { data } = await query;
  return (data as LeadRow[] | null) ?? [];
}

export async function countLeadsByStatus(): Promise<Record<LeadStatus, number>> {
  const { data } = await supabaseAdmin().from('leads').select('status');
  const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const row of (data as Array<{ status: LeadStatus }> | null) ?? []) counts[row.status] += 1;
  return counts;
}

export async function getLead(leadId: string): Promise<LeadRow | null> {
  const { data } = await supabaseAdmin().from('leads').select('*').eq('id', leadId).maybeSingle();
  return (data as LeadRow | null) ?? null;
}

export async function listLeadActivities(leadId: string): Promise<LeadActivityRow[]> {
  const { data } = await supabaseAdmin()
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  return (data as LeadActivityRow[] | null) ?? [];
}

export interface StaffMember {
  userId: string;
  email: string;
  name: string | null;
}

/** Кому можно назначить заявку: действующие владельцы и менеджеры. */
export async function listStaff(): Promise<StaffMember[]> {
  const { data } = await supabaseAdmin()
    .from('admin_users')
    .select('user_id, email, name')
    .is('disabled_at', null)
    .in('role', [...CRM_ROLES])
    .order('email');
  return (
    (data as Array<{ user_id: string; email: string; name: string | null }> | null) ?? []
  ).map((row) => ({ userId: row.user_id, email: row.email, name: row.name }));
}

export function staffLabel(member: StaffMember | undefined): string | null {
  if (!member) return null;
  return member.name ?? member.email;
}
