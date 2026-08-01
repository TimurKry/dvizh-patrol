import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { EventRow, TeamMemberRow, TeamRow } from '@/types/database';

/**
 * Командные сессии.
 *
 * Участникам не нужны ни email, ни пароль. Вход — это владение
 * секретным токеном, который лежит в httpOnly cookie.
 *
 * Устройство токена:
 *
 *   cookie = <token>.<подпись>
 *   token  — 32 случайных байта, base64url;
 *   подпись — HMAC-SHA256(SESSION_SECRET, token);
 *   в базе  — SHA-256(token), сам токен не хранится нигде.
 *
 * Cookie содержит только непрозрачный идентификатор. team_id
 * приходит исключительно из базы после проверки, поэтому
 * подменить команду, отредактировав cookie, невозможно.
 */

const COOKIE_NAME = 'dp_team';
/** Как часто обновлять last_seen_at, чтобы не писать на каждый запрос. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface TeamSessionContext {
  sessionId: string;
  teamId: string;
  memberId: string | null;
  team: TeamRow;
  member: TeamMemberRow | null;
  event: EventRow;
}

interface IssuedToken {
  /** Значение для cookie. */
  cookieValue: string;
  /** Что кладётся в team_sessions.token_hash. */
  tokenHash: string;
}

// ═══ Криптография ══════════════════════════════════════════════

function sign(token: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(token).digest('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Создаёт новый токен сессии. В базу уходит только хэш. */
export function issueSessionToken(): IssuedToken {
  const token = randomBytes(32).toString('base64url');
  return {
    cookieValue: `${token}.${sign(token)}`,
    tokenHash: hashToken(token),
  };
}

/**
 * Проверяет подпись и возвращает хэш токена.
 *
 * Подпись отсекает мусор и подобранные значения до обращения
 * к базе. Сравнение постоянное по времени.
 */
function parseCookie(value: string): string | null {
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const token = value.slice(0, separator);
  const provided = value.slice(separator + 1);
  const expected = sign(token);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return hashToken(token);
}

// ═══ Cookie ════════════════════════════════════════════════════

export async function setTeamSessionCookie(cookieValue: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: env().TEAM_SESSION_TTL_HOURS * 3600,
  });
}

export async function clearTeamSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// ═══ Чтение сессии ═════════════════════════════════════════════

/**
 * Текущая команда или null.
 *
 * Единственный способ узнать team_id на сервере. Ни один
 * обработчик не должен принимать team_id от клиента.
 */
export async function getTeamSession(): Promise<TeamSessionContext | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const tokenHash = parseCookie(raw);
  if (!tokenHash) return null;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('team_sessions')
    .select(
      `id, team_id, member_id, expires_at, revoked_at, last_seen_at,
       teams:team_id ( *, events:event_id ( * ) ),
       team_members:member_id ( * )`,
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  // Supabase отдаёт вложенные связи как объект или массив
  // в зависимости от кардинальности — приводим к одному виду.
  const team = normalizeRelation<TeamRow & { events: EventRow | EventRow[] }>(data.teams);
  if (!team) return null;

  const event = normalizeRelation<EventRow>(team.events);
  if (!event) return null;

  const member = normalizeRelation<TeamMemberRow>(data.team_members);

  // Команду, снятую с мероприятия, дальше не пускаем.
  if (team.status === 'cancelled') return null;

  void touchSession(data.id, data.last_seen_at);

  return {
    sessionId: data.id,
    teamId: data.team_id,
    memberId: data.member_id,
    team: stripRelations(team),
    member,
    event,
  };
}

function normalizeRelation<T>(value: unknown): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function stripRelations(team: TeamRow & { events?: unknown }): TeamRow {
  const { events: _events, ...rest } = team;
  return rest as TeamRow;
}

/** Отметка активности. Пишем редко, чтобы не нагружать базу. */
async function touchSession(sessionId: string, lastSeenAt: string): Promise<void> {
  if (Date.now() - new Date(lastSeenAt).getTime() < TOUCH_INTERVAL_MS) return;
  try {
    await supabaseAdmin()
      .from('team_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', sessionId);
  } catch {
    // Метка активности не должна ронять запрос.
  }
}

// ═══ Завершение сессии ═════════════════════════════════════════

export async function revokeCurrentTeamSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;

  if (raw) {
    const tokenHash = parseCookie(raw);
    if (tokenHash) {
      try {
        await supabaseAdmin()
          .from('team_sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('token_hash', tokenHash);
      } catch {
        // Даже если запись не удалась, cookie всё равно удаляем.
      }
    }
  }

  await clearTeamSessionCookie();
}

/** Отзывает все сессии команды — кнопка администратора. */
export async function revokeAllTeamSessions(teamId: string): Promise<void> {
  await supabaseAdmin()
    .from('team_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .is('revoked_at', null);
}
