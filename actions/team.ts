'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { env } from '@/lib/env';

import { checkRateLimit, currentUserAgent } from '@/lib/rate-limit';
import { getCurrentEvent } from '@/lib/data/event';
import { callRpc } from '@/lib/supabase/admin';
import {
  getTeamSession,
  issueSessionToken,
  revokeCurrentTeamSession,
  setTeamSessionCookie,
} from '@/lib/session/team-session';
import { fieldErrors, joinTeamSchema, registerTeamSchema } from '@/lib/validation/schemas';

/**
 * Серверные действия команды.
 *
 * Ни одно из них не принимает team_id от клиента: команда всегда
 * берётся из подписанной cookie, а лимиты проверяются в базе.
 */

export interface ActionState {
  ok: boolean;
  error?: string;
  fields?: Record<string, string>;
}

/** Алфавит кода без символов, которые путают при чтении: 0/O, 1/I. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Кандидаты в коды приглашения.
 *
 * Генерируются криптостойким источником. База берёт первый
 * свободный — так не нужен цикл «вставить и поймать конфликт».
 */
function generateJoinCodes(count = 5): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(6);
    let code = '';
    for (let j = 0; j < 6; j += 1) {
      code += CODE_ALPHABET[bytes[j]! % CODE_ALPHABET.length];
    }
    codes.push(code);
  }
  return codes;
}

// ═══ Регистрация команды ═══════════════════════════════════════

export async function registerTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerTeamSchema.safeParse({
    teamName: formData.get('teamName'),
    captainName: formData.get('captainName'),
    contact: formData.get('contact') ?? '',
    acceptRules: formData.get('acceptRules') === 'on',
    allowSocialPublication: formData.get('allowSocialPublication') === 'on',
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  const limit = await checkRateLimit('registerTeam');
  if (!limit.allowed) {
    return { ok: false, error: 'rate_limited' };
  }

  const event = await getCurrentEvent();
  if (!event) {
    return { ok: false, error: 'event_not_found' };
  }

  const { cookieValue, tokenHash } = issueSessionToken();

  const result = await callRpc<{ teamId: string; joinCode: string }>('register_team', {
    p_event_id: event.id,
    p_team_name: parsed.data.teamName,
    p_captain_name: parsed.data.captainName,
    p_contact: parsed.data.contact || null,
    p_candidate_codes: generateJoinCodes(),
    p_session_token_hash: tokenHash,
    p_session_ttl_hours: env().TEAM_SESSION_TTL_HOURS,
    p_policy_version: env().POLICY_VERSION,
    p_social_consent: parsed.data.allowSocialPublication,
    p_user_agent: await currentUserAgent(),
    p_bypass_limits: false,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await setTeamSessionCookie(cookieValue);
  revalidatePath('/');
  redirect('/team?welcome=1');
}

// ═══ Вход по коду ══════════════════════════════════════════════

export async function joinTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = joinTeamSchema.safeParse({
    joinCode: formData.get('joinCode'),
    memberName: formData.get('memberName'),
    acceptRules: formData.get('acceptRules') === 'on',
    allowSocialPublication: formData.get('allowSocialPublication') === 'on',
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  const limit = await checkRateLimit('joinTeam');
  if (!limit.allowed) {
    return { ok: false, error: 'rate_limited' };
  }

  const event = await getCurrentEvent();
  if (!event) {
    return { ok: false, error: 'event_not_found' };
  }

  const { cookieValue, tokenHash } = issueSessionToken();

  const result = await callRpc<{ teamId: string; teamName: string }>('join_team', {
    p_event_id: event.id,
    p_join_code: parsed.data.joinCode,
    p_member_name: parsed.data.memberName,
    p_session_token_hash: tokenHash,
    p_session_ttl_hours: env().TEAM_SESSION_TTL_HOURS,
    p_policy_version: env().POLICY_VERSION,
    p_social_consent: parsed.data.allowSocialPublication,
    p_user_agent: await currentUserAgent(),
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await setTeamSessionCookie(cookieValue);
  revalidatePath('/');
  redirect('/team');
}

// ═══ Выход ═════════════════════════════════════════════════════

export async function logoutTeamAction(): Promise<void> {
  await revokeCurrentTeamSession();
  revalidatePath('/');
  redirect('/');
}

// ═══ Управление составом капитаном ═════════════════════════════

/**
 * Капитан может убрать участника до старта квеста.
 * После старта состав фиксируется: удаление меняло бы условия
 * уже идущей игры.
 */
export async function removeMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getTeamSession();
  if (!session) return { ok: false, error: 'unauthorized' };

  if (!session.member?.is_captain) {
    return { ok: false, error: 'forbidden' };
  }

  if (session.event.status !== 'registration') {
    return { ok: false, error: 'forbidden' };
  }

  const memberId = String(formData.get('memberId') ?? '');
  if (!memberId) return { ok: false, error: 'validation_failed' };

  // Капитан не может удалить сам себя.
  if (memberId === session.memberId) {
    return { ok: false, error: 'forbidden' };
  }

  const { supabaseAdmin } = await import('@/lib/supabase/admin');
  const db = supabaseAdmin();

  // Удаляем только участника СВОЕЙ команды — team_id берётся
  // из сессии, а не из формы.
  const { error } = await db
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', session.teamId)
    .eq('is_captain', false);

  if (error) {
    return { ok: false, error: 'database_error' };
  }

  // Сессии удалённого участника отзываем.
  await db
    .from('team_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('member_id', memberId);

  revalidatePath('/team');
  revalidatePath('/team/members');
  return { ok: true };
}
