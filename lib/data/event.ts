import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { EventRow, TaskRow } from '@/types/database';

/**
 * Чтение мероприятия.
 *
 * Приложение рассчитано на одно активное событие, но нигде не
 * зашивает его идентификатор: берётся самое свежее неархивное.
 * Благодаря этому следующий квест заводится через админку, а не
 * правкой кода.
 */

export const CURRENT_EVENT_SLUG = process.env.NEXT_PUBLIC_EVENT_SLUG ?? 'leipzig-2026';

export async function getCurrentEvent(): Promise<EventRow | null> {
  const db = supabaseAdmin();

  // Сначала — событие с известным slug.
  const bySlug = await db
    .from('events')
    .select('*')
    .eq('slug', CURRENT_EVENT_SLUG)
    .maybeSingle();

  if (bySlug.data) return bySlug.data as EventRow;

  // Запасной путь: любое неархивное, самое позднее по дате старта.
  const fallback = await db
    .from('events')
    .select('*')
    .neq('status', 'archived')
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (fallback.data as EventRow | null) ?? null;
}

export async function getEventById(eventId: string): Promise<EventRow | null> {
  const { data } = await supabaseAdmin().from('events').select('*').eq('id', eventId).maybeSingle();
  return (data as EventRow | null) ?? null;
}

/**
 * Сколько заданий в мероприятии.
 *
 * Число нигде не хардкодится: главная страница показывает ровно
 * столько, сколько активных записей в базе.
 */
export async function getActiveTaskCount(eventId: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('active', true);

  return count ?? 0;
}

export async function getActiveTasks(eventId: string): Promise<TaskRow[]> {
  const { data } = await supabaseAdmin()
    .from('tasks')
    .select('*')
    .eq('event_id', eventId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('number', { ascending: true });

  return (data as TaskRow[] | null) ?? [];
}

/** Сколько команд уже зарегистрировано и сколько мест осталось. */
export async function getRegistrationStats(event: EventRow): Promise<{
  active: number;
  confirmed: number;
  pending: number;
  free: number;
  members: number;
  isFull: boolean;
  canRegister: boolean;
}> {
  const db = supabaseAdmin();

  const [teamsResult, membersResult] = await Promise.all([
    db.from('teams').select('id, status').eq('event_id', event.id),
    db
      .from('team_members')
      .select('id, teams!inner(event_id, status)')
      .eq('teams.event_id', event.id)
      .neq('teams.status', 'cancelled'),
  ]);

  const teams = (teamsResult.data as Array<{ status: string }> | null) ?? [];
  const active = teams.filter((t) => t.status !== 'cancelled').length;
  const confirmed = teams.filter((t) => t.status === 'confirmed').length;
  const pending = teams.filter((t) => t.status === 'pending').length;
  const free = Math.max(0, event.max_teams - active);

  return {
    active,
    confirmed,
    pending,
    free,
    members: membersResult.data?.length ?? 0,
    isFull: free === 0,
    canRegister: event.status === 'registration' && event.registration_open && free > 0,
  };
}

// ═══ Форматирование ════════════════════════════════════════════

/**
 * Дата и время всегда в часовом поясе мероприятия.
 * Локальное время телефона не используется нигде: участник
 * может прилететь из другого пояса и не переставить часы.
 */
export function formatEventDate(event: EventRow): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: event.timezone,
  }).format(new Date(event.starts_at));
}

export function formatEventTime(event: EventRow): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: event.timezone,
  }).format(new Date(event.starts_at));
}

export function formatEventDateLong(event: EventRow): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: event.timezone,
  }).format(new Date(event.starts_at));
}

export function formatPrice(event: EventRow): string {
  const amount = event.price_cents / 100;
  const formatted = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const symbol = event.currency === 'EUR' ? '€' : event.currency;
  return `${formatted} ${symbol}`;
}

/** Идёт ли приём отправок прямо сейчас. */
export function isSubmissionOpen(event: EventRow): boolean {
  return event.status === 'live';
}
