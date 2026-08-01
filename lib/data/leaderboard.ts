import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { EventRow, LeaderboardRow } from '@/types/database';

/**
 * Рейтинг.
 *
 * Режим показа решает, что именно увидит запрашивающий, поэтому
 * фильтрация выполняется здесь, на сервере, а не в компоненте.
 * Отдать лишние строки и «спрятать» их разметкой — не вариант.
 */

export interface LeaderboardEntry {
  position: number;
  rank: number;
  teamId: string;
  teamName: string;
  totalPoints: number;
  acceptedCount: number;
  /** Строка принадлежит команде, которая смотрит рейтинг. */
  isOwn: boolean;
}

export type LeaderboardView =
  | { mode: 'public'; entries: LeaderboardEntry[]; frozenAt: null }
  | { mode: 'frozen'; entries: LeaderboardEntry[]; frozenAt: string | null }
  | { mode: 'team_position_only'; entry: LeaderboardEntry | null; totalTeams: number }
  | { mode: 'hidden' }
  | { mode: 'not_started' };

export async function getLeaderboard(
  event: EventRow,
  viewerTeamId: string | null,
): Promise<LeaderboardView> {
  // До старта таблицы ещё нет — показывать нечего.
  if (!['live', 'paused', 'finished', 'archived'].includes(event.status)) {
    return { mode: 'not_started' };
  }

  if (event.leaderboard_mode === 'hidden') {
    return { mode: 'hidden' };
  }

  const db = supabaseAdmin();

  // Замороженный рейтинг читается из снимка: он не меняется,
  // даже если организатор продолжает принимать фотографии.
  if (event.leaderboard_mode === 'frozen') {
    const { data } = await db
      .from('leaderboard_snapshots')
      .select('*')
      .eq('event_id', event.id)
      .order('position', { ascending: true });

    const rows = data ?? [];
    return {
      mode: 'frozen',
      frozenAt: event.leaderboard_frozen_at,
      entries: rows.map((row) => ({
        position: row.position,
        rank: row.position,
        teamId: row.team_id,
        teamName: row.team_name,
        totalPoints: row.total_points,
        acceptedCount: row.accepted_count,
        isOwn: row.team_id === viewerTeamId,
      })),
    };
  }

  const { data } = await db
    .from('leaderboard')
    .select('*')
    .eq('event_id', event.id)
    .order('position', { ascending: true });

  const entries: LeaderboardEntry[] = ((data as LeaderboardRow[] | null) ?? []).map((row) => ({
    position: row.position,
    rank: row.rank,
    teamId: row.team_id,
    teamName: row.team_name,
    totalPoints: row.total_points,
    acceptedCount: row.accepted_count,
    isOwn: row.team_id === viewerTeamId,
  }));

  if (event.leaderboard_mode === 'team_position_only') {
    return {
      mode: 'team_position_only',
      entry: entries.find((e) => e.isOwn) ?? null,
      totalTeams: entries.length,
    };
  }

  return { mode: 'public', entries, frozenAt: null };
}

/** Место команды — для карточки на её главной странице. */
export async function getTeamStanding(
  event: EventRow,
  teamId: string,
): Promise<{ position: number; totalTeams: number; totalPoints: number; acceptedCount: number } | null> {
  const { data } = await supabaseAdmin()
    .from('leaderboard')
    .select('*')
    .eq('event_id', event.id)
    .order('position', { ascending: true });

  const rows = (data as LeaderboardRow[] | null) ?? [];
  const own = rows.find((r) => r.team_id === teamId);
  if (!own) return null;

  return {
    position: own.position,
    totalTeams: rows.length,
    totalPoints: own.total_points,
    acceptedCount: own.accepted_count,
  };
}
