import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

/**
 * Подключение к тестовой базе и утилиты для сценариев.
 *
 * Пул один на весь прогон: интеграционные тесты выполняются в
 * одном процессе, а часть проверок специально открывает несколько
 * соединений одновременно, чтобы поймать гонку.
 */

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 30,
});

export async function closePool(): Promise<void> {
  await pool.end();
}

/** Полная очистка данных между сценариями. Схема остаётся. */
export async function resetData(): Promise<void> {
  await pool.query(`
    TRUNCATE
      public.score_transactions,
      public.validation_jobs,
      public.submissions,
      public.consents,
      public.team_sessions,
      public.team_members,
      public.teams,
      public.task_reference_images,
      public.tasks,
      public.leaderboard_snapshots,
      public.admin_audit_log,
      public.rate_limits,
      public.events
    RESTART IDENTITY CASCADE
  `);
}

export interface TestEventOptions {
  slug?: string;
  status?: string;
  maxTeams?: number;
  teamSize?: number;
  registrationOpen?: boolean;
  aiEnabled?: boolean;
}

export async function createEvent(options: TestEventOptions = {}): Promise<string> {
  const {
    slug = `test-${randomBytes(4).toString('hex')}`,
    status = 'registration',
    maxTeams = 10,
    teamSize = 4,
    registrationOpen = true,
    aiEnabled = true,
  } = options;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO public.events
       (slug, title, city, timezone, starts_at, status, price_cents,
        max_teams, team_size, registration_open, ai_validation_enabled)
     VALUES ($1, 'Тестовый квест', 'Leipzig', 'Europe/Berlin', now() + interval '1 day',
             $2, 1500, $3, $4, $5, $6)
     RETURNING id`,
    [slug, status, maxTeams, teamSize, registrationOpen, aiEnabled],
  );

  return rows[0]!.id;
}

export interface TestTaskOptions {
  number?: number;
  points?: number;
  validationMode?: 'auto' | 'ai' | 'manual';
  maxAttempts?: number;
  criteria?: string[];
  active?: boolean;
}

export async function createTask(
  eventId: string,
  options: TestTaskOptions = {},
): Promise<string> {
  const {
    number = 1,
    points = 50,
    validationMode = 'manual',
    maxAttempts = 2,
    criteria = ['Тестовый критерий'],
    active = true,
  } = options;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO public.tasks
       (event_id, number, title, description, points, category, difficulty,
        validation_mode, criteria, max_attempts, active, sort_order)
     VALUES ($1, $2, $3, 'Описание тестового задания', $4, 'object_search', 'easy',
             $5, $6::jsonb, $7, $8, $2)
     RETURNING id`,
    [
      eventId,
      number,
      `Задание ${number}`,
      points,
      validationMode,
      JSON.stringify(criteria),
      maxAttempts,
      active,
    ],
  );

  return rows[0]!.id;
}

/** Хэш сессии нужного формата: 64 шестнадцатеричных символа. */
export function sessionHash(seed = randomUUID()): string {
  return createHash('sha256').update(seed).digest('hex');
}

/** Коды приглашения так же, как их делает приложение. */
export function joinCodes(count = 5): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i += 1) code += alphabet[bytes[i]! % alphabet.length];
    return code;
  });
}

export interface RegisterResult {
  ok: boolean;
  error?: string;
  teamId?: string;
  joinCode?: string;
  memberId?: string;
}

export async function registerTeam(
  eventId: string,
  name: string,
  options: { client?: PoolClient; bypassLimits?: boolean } = {},
): Promise<RegisterResult> {
  const executor = options.client ?? pool;
  const { rows } = await executor.query<{ r: RegisterResult }>(
    `SELECT public.register_team($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS r`,
    [
      eventId,
      name,
      `Капитан ${name}`,
      null,
      joinCodes(),
      sessionHash(),
      72,
      'test-policy',
      false,
      'test',
      options.bypassLimits ?? false,
    ],
  );
  return rows[0]!.r;
}

export async function joinTeam(
  eventId: string,
  joinCode: string,
  memberName: string,
  client?: PoolClient,
): Promise<{ ok: boolean; error?: string; memberId?: string }> {
  const executor = client ?? pool;
  const { rows } = await executor.query<{ r: { ok: boolean; error?: string; memberId?: string } }>(
    `SELECT public.join_team($1,$2,$3,$4,$5,$6,$7,$8) AS r`,
    [eventId, joinCode, memberName, sessionHash(), 72, 'test-policy', false, 'test'],
  );
  return rows[0]!.r;
}

export interface SlotResult {
  ok: boolean;
  error?: string;
  submissionId?: string;
  attemptNumber?: number;
  reused?: boolean;
  status?: string;
}

export async function createSlot(
  teamId: string,
  taskId: string,
  idempotencyKey: string | null = null,
): Promise<SlotResult> {
  const { rows } = await pool.query<{ r: SlotResult }>(
    `SELECT public.create_submission_slot($1,$2,$3,$4,$5) AS r`,
    [teamId, taskId, null, idempotencyKey, false],
  );
  return rows[0]!.r;
}

export async function confirmSubmission(
  submissionId: string,
  options: {
    duplicateOf?: string | null;
    similarity?: number | null;
    aiAvailable?: boolean;
    hash?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    outsideArea?: boolean;
  } = {},
): Promise<{ ok: boolean; status?: string; reviewReason?: string | null }> {
  const { rows } = await pool.query<{
    r: { ok: boolean; status?: string; reviewReason?: string | null };
  }>(`SELECT public.confirm_submission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS r`, [
    submissionId,
    `events/x/teams/y/tasks/z/${submissionId}.webp`,
    120_000,
    'image/webp',
    options.hash ?? null,
    options.duplicateOf ?? null,
    options.similarity ?? null,
    options.latitude ?? null,
    options.longitude ?? null,
    null,
    options.aiAvailable ?? false,
    options.outsideArea ?? false,
  ]);
  return rows[0]!.r;
}

export async function acceptSubmission(
  submissionId: string,
  points: number | null = null,
): Promise<{ ok: boolean; error?: string; alreadyAccepted?: boolean; points?: number }> {
  const { rows } = await pool.query<{
    r: { ok: boolean; error?: string; alreadyAccepted?: boolean; points?: number };
  }>(`SELECT public.accept_submission($1,$2,$3,$4,$5) AS r`, [
    submissionId,
    points,
    null,
    'test',
    null,
  ]);
  return rows[0]!.r;
}

export async function revokeSubmission(
  submissionId: string,
): Promise<{ ok: boolean; reversed?: boolean }> {
  const { rows } = await pool.query<{ r: { ok: boolean; reversed?: boolean } }>(
    `SELECT public.revoke_submission($1,$2,$3,$4) AS r`,
    [submissionId, null, 'test revoke', 'rejected'],
  );
  return rows[0]!.r;
}

export async function teamScore(teamId: string): Promise<number> {
  const { rows } = await pool.query<{ total_points: number }>(
    `SELECT COALESCE(total_points, 0) AS total_points
     FROM public.team_scores WHERE team_id = $1`,
    [teamId],
  );
  return Number(rows[0]?.total_points ?? 0);
}
