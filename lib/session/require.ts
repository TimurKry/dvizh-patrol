import 'server-only';
import { redirect } from 'next/navigation';
import { getTeamSession, type TeamSessionContext } from '@/lib/session/team-session';

/**
 * Страница только для вошедшей команды.
 *
 * Единственная точка, где принимается решение о доступе на
 * командных маршрутах. Возвращает контекст, а не флаг, чтобы
 * страница не ходила за сессией второй раз.
 */
export async function requireTeamSession(): Promise<TeamSessionContext> {
  const session = await getTeamSession();
  if (!session) redirect('/join');
  return session;
}
