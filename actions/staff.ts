'use server';

import { revalidatePath } from 'next/cache';
import { audit, requireRole, type AdminContext } from '@/lib/auth/admin';
import { appUrl } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  fieldErrors,
  staffInviteSchema,
  staffRoleSchema,
  staffUserSchema,
} from '@/lib/validation/schemas';
import type { AdminUserRow } from '@/types/database';
import type { AdminActionState } from '@/actions/admin';

/**
 * Команда Студии: приглашение, роли, доступ.
 *
 * Всё здесь — только для владельца. Защита от «студии без
 * владельца» живёт в базе (триггер admin_users_keep_owner), а не
 * только в интерфейсе: здесь она лишь переводит отказ на русский.
 */

export interface StaffLinkState extends AdminActionState {
  /** Одноразовая ссылка для входа — показывается владельцу, не хранится. */
  link?: string;
  linkFor?: string;
}

/**
 * Одноразовая ссылка для входа.
 *
 * Не письмо, а ссылка в руки владельцу: он пересылает её в
 * Telegram сам. Так вход не зависит ни от почтовых лимитов
 * Supabase, ни от настройки адресов перенаправления, а человек
 * открывает ссылку на том телефоне, где ему удобно.
 */
async function loginLink(email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) {
    console.error('[staff] generateLink failed', error?.message);
    return null;
  }
  const url = new URL('/auth/confirm', appUrl());
  url.searchParams.set('token_hash', hash);
  url.searchParams.set('type', 'magiclink');
  return url.toString();
}

/** Пользователь Supabase Auth с этой почтой — существующий или новый. */
async function ensureAuthUser(email: string): Promise<string | null> {
  const db = supabaseAdmin();
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) return created.data.user.id;

  // Почта уже зарегистрирована — достаём id через ту же генерацию ссылки.
  const { data } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  return data?.user?.id ?? null;
}

async function loadStaff(userId: string): Promise<AdminUserRow | null> {
  const { data } = await supabaseAdmin()
    .from('admin_users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as AdminUserRow | null) ?? null;
}

function lastOwnerMessage(error: { message?: string } | null): string | null {
  return error?.message?.includes('last_owner')
    ? 'Это последний владелец. Сначала назначьте владельцем кого-то ещё.'
    : null;
}

function refresh(): void {
  revalidatePath('/studio/team');
}

// ═══ Приглашение ═══════════════════════════════════════════════

export async function inviteStaffAction(
  _prev: StaffLinkState,
  formData: FormData,
): Promise<StaffLinkState> {
  const owner = await requireRole('owner');

  const parsed = staffInviteSchema.safeParse({
    email: formData.get('email') ?? '',
    name: formData.get('name') ?? '',
    role: formData.get('role') ?? 'manager',
  });
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }
  const { email, name, role } = parsed.data;

  const userId = await ensureAuthUser(email);
  if (!userId) return { ok: false, message: 'Не удалось создать аккаунт. Проверьте почту.' };

  const existing = await loadStaff(userId);
  if (existing && !existing.disabled_at) {
    return { ok: false, message: 'Этот человек уже в команде.' };
  }

  const { error } = await supabaseAdmin()
    .from('admin_users')
    .upsert(
      { user_id: userId, email, name, role, invited_by: owner.userId, disabled_at: null },
      { onConflict: 'user_id' },
    );
  if (error) return { ok: false, message: 'Не удалось добавить в команду.' };

  await audit({
    admin: owner,
    action: existing ? 'staff_reinvited' : 'staff_invited',
    entityType: 'staff',
    entityId: userId,
    after: { email, role },
  });

  refresh();
  const link = await loginLink(email);
  return link
    ? { ok: true, message: `${email} добавлен(а) в команду.`, link, linkFor: email }
    : {
        ok: true,
        message: `${email} добавлен(а). Ссылку создать не удалось — пусть войдёт по почте.`,
      };
}

// ═══ Ссылка для входа ══════════════════════════════════════════

export async function staffLoginLinkAction(
  _prev: StaffLinkState,
  formData: FormData,
): Promise<StaffLinkState> {
  const owner = await requireRole('owner');
  const parsed = staffUserSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return { ok: false, message: 'Сотрудник не найден.' };

  const staff = await loadStaff(parsed.data.userId);
  if (!staff || staff.disabled_at) return { ok: false, message: 'Доступ у сотрудника закрыт.' };

  const link = await loginLink(staff.email);
  if (!link) return { ok: false, message: 'Не удалось создать ссылку.' };

  await audit({
    admin: owner,
    action: 'staff_login_link',
    entityType: 'staff',
    entityId: staff.user_id,
  });
  return { ok: true, link, linkFor: staff.email };
}

// ═══ Роль ══════════════════════════════════════════════════════

export async function changeStaffRoleAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const owner = await requireRole('owner');
  const parsed = staffRoleSchema.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { ok: false, message: 'Проверьте роль.' };

  const staff = await loadStaff(parsed.data.userId);
  if (!staff) return { ok: false, message: 'Сотрудник не найден.' };
  if (staff.role === parsed.data.role) return { ok: true, message: 'Без изменений.' };

  const { error } = await supabaseAdmin()
    .from('admin_users')
    .update({ role: parsed.data.role })
    .eq('user_id', staff.user_id);
  if (error) return { ok: false, message: lastOwnerMessage(error) ?? 'Не удалось сменить роль.' };

  await audit({
    admin: owner,
    action: 'staff_role_changed',
    entityType: 'staff',
    entityId: staff.user_id,
    before: { role: staff.role },
    after: { role: parsed.data.role },
  });

  refresh();
  return { ok: true, message: 'Роль обновлена.' };
}

// ═══ Доступ ════════════════════════════════════════════════════

async function setDisabled(
  owner: AdminContext,
  formData: FormData,
  disabled: boolean,
): Promise<AdminActionState> {
  const parsed = staffUserSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return { ok: false, message: 'Сотрудник не найден.' };

  const staff = await loadStaff(parsed.data.userId);
  if (!staff) return { ok: false, message: 'Сотрудник не найден.' };

  const { error } = await supabaseAdmin()
    .from('admin_users')
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq('user_id', staff.user_id);
  if (error) return { ok: false, message: lastOwnerMessage(error) ?? 'Не удалось сохранить.' };

  // Выкидывать из открытых вкладок отдельно не нужно: getAdmin
  // сверяет disabled_at на каждом запросе, и следующий же клик
  // отключённого сотрудника уведёт его на страницу входа.
  await audit({
    admin: owner,
    action: disabled ? 'staff_disabled' : 'staff_enabled',
    entityType: 'staff',
    entityId: staff.user_id,
  });

  refresh();
  return { ok: true, message: disabled ? 'Доступ закрыт.' : 'Доступ открыт.' };
}

export async function disableStaffAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const owner = await requireRole('owner');
  return setDisabled(owner, formData, true);
}

export async function enableStaffAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const owner = await requireRole('owner');
  return setDisabled(owner, formData, false);
}
