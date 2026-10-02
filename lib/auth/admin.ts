import 'server-only';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AdminUserRow, StaffRole } from '@/types/database';
import { staffHome } from '@/lib/studio/staff';

/**
 * Права администратора.
 *
 * Роль проверяется на сервере по таблице admin_users, а не по
 * метаданным токена: метаданные пользователь в некоторых схемах
 * может менять сам, строку в таблице — нет.
 *
 * Наличие сессии Supabase Auth само по себе прав не даёт.
 */

export interface AdminContext {
  userId: string;
  email: string;
  name: string | null;
  role: StaffRole;
}

export async function getAdmin(): Promise<AdminContext | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabaseAdmin()
    .from('admin_users')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const record = data as AdminUserRow | null;
  // Отключённый сотрудник — то же, что посторонний.
  if (!record || record.disabled_at) return null;

  return {
    userId: record.user_id,
    email: record.email,
    name: record.name,
    role: record.role,
  };
}

/** Страница только для администратора. */
export async function requireAdmin(): Promise<AdminContext> {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/login');
  return admin;
}

/**
 * Страница для определённых ролей.
 *
 * Чужая роль получает не ошибку, а свой стартовый экран: ведущий,
 * открывший ссылку на заявку, попадает в игру, а не в тупик.
 */
export async function requireRole(...roles: StaffRole[]): Promise<AdminContext> {
  const admin = await requireAdmin();
  if (!roles.includes(admin.role)) redirect(staffHome(admin.role));
  return admin;
}

// ═══ Журнал действий ═══════════════════════════════════════════

/**
 * Запись в журнал.
 *
 * Пишется после каждого действия, меняющего состояние: результаты
 * квеста должны быть объяснимы через месяц после мероприятия,
 * а спорные решения — восстановимы.
 *
 * Сбой записи не отменяет само действие: терять начисление
 * из-за проблемы с журналом хуже, чем потерять строку журнала.
 */
export async function audit(params: {
  admin: Pick<AdminContext, 'userId' | 'email'> | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await supabaseAdmin()
      .from('admin_audit_log')
      .insert({
        admin_id: params.admin?.userId ?? null,
        admin_email: params.admin?.email ?? null,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null,
        before_data: params.before ?? null,
        after_data: params.after ?? null,
      });
  } catch {
    // Журнал не должен ронять действие администратора.
  }
}
