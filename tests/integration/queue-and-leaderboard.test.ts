import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptSubmission,
  closePool,
  confirmSubmission,
  createEvent,
  createSlot,
  createTask,
  pool,
  registerTeam,
  resetData,
} from '../helpers/db';

/**
 * Очередь проверок и рейтинг.
 *
 * Очередь должна выдерживать несколько обработчиков сразу и
 * возвращать зависшие задачи. Рейтинг должен считаться из
 * журнала начислений, а не из отдельного счётчика.
 */

let eventId: string;

beforeEach(async () => {
  await resetData();
  eventId = await createEvent({ status: 'live', registrationOpen: false });
});

afterAll(async () => {
  await closePool();
});

async function queuedSubmission(teamId: string, taskNumber: number): Promise<string> {
  const taskId = await createTask(eventId, { number: taskNumber, validationMode: 'ai' });
  const slot = await createSlot(teamId, taskId);
  await confirmSubmission(slot.submissionId!, { aiAvailable: true });
  return slot.submissionId!;
}

interface ClaimedJob {
  job_id: string;
  submission_id: string;
  attempts: number;
}

async function claim(workerId: string, limit = 4, staleMinutes = 5): Promise<ClaimedJob[]> {
  const { rows } = await pool.query<ClaimedJob>(
    `SELECT * FROM public.claim_validation_jobs($1, $2, $3)`,
    [workerId, limit, staleMinutes],
  );
  return rows;
}

describe('очередь проверок', () => {
  it('забирает задачи и переводит отправку в checking', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    const submissionId = await queuedSubmission(team.teamId!, 1);

    const jobs = await claim('worker-1');

    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.submission_id).toBe(submissionId);
    expect(jobs[0]!.attempts).toBe(1);

    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM public.submissions WHERE id = $1`,
      [submissionId],
    );
    expect(rows[0]!.status).toBe('checking');
  });

  it('уважает размер пачки', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    for (let i = 1; i <= 6; i += 1) await queuedSubmission(team.teamId!, i);

    expect(await claim('worker-1', 4)).toHaveLength(4);
    // Остаток забирает следующий проход.
    expect(await claim('worker-1', 4)).toHaveLength(2);
  });

  it('два обработчика не берут одну задачу', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    for (let i = 1; i <= 8; i += 1) await queuedSubmission(team.teamId!, i);

    const [first, second] = await Promise.all([claim('worker-1', 4), claim('worker-2', 4)]);

    const ids = [...first, ...second].map((j) => j.submission_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(8);
  });

  it('не выдаёт задачу повторно, пока она в работе', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    await queuedSubmission(team.teamId!, 1);

    expect(await claim('worker-1')).toHaveLength(1);
    expect(await claim('worker-2')).toHaveLength(0);
  });

  it('возвращает в очередь задачу зависшего обработчика', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    await queuedSubmission(team.teamId!, 1);

    const [job] = await claim('worker-1');

    // Обработчик умер десять минут назад, не сняв блокировку.
    await pool.query(
      `UPDATE public.validation_jobs SET locked_at = now() - interval '10 minutes' WHERE id = $1`,
      [job!.job_id],
    );

    const reclaimed = await claim('worker-2', 4, 5);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]!.attempts).toBe(2);
  });

  it('после ошибки ставит задачу на повтор с задержкой', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    await queuedSubmission(team.teamId!, 1);
    const [job] = await claim('worker-1');

    const { rows } = await pool.query<{ r: { retrying: boolean } }>(
      `SELECT public.fail_validation_job($1, 'таймаут', 2, 30) AS r`,
      [job!.job_id],
    );

    expect(rows[0]!.r.retrying).toBe(true);

    // Повтор запланирован на будущее, поэтому сейчас задача не выдаётся.
    expect(await claim('worker-1')).toHaveLength(0);
  });

  it('после исчерпания попыток уводит отправку к человеку', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    const submissionId = await queuedSubmission(team.teamId!, 1);

    const [job] = await claim('worker-1');
    await pool.query(`SELECT public.fail_validation_job($1, 'ошибка', 1, 0)`, [job!.job_id]);

    const { rows } = await pool.query<{ status: string; review_reason: string | null }>(
      `SELECT status, review_reason FROM public.submissions WHERE id = $1`,
      [submissionId],
    );

    expect(rows[0]!.status).toBe('manual_review');
    expect(rows[0]!.review_reason).toBe('ai_error');
  });

  it('повторная обработка не начисляет баллы дважды', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    const submissionId = await queuedSubmission(team.teamId!, 1);

    await claim('worker-1');
    await acceptSubmission(submissionId, 50);

    // Задача снова попала в очередь и снова обработалась.
    await pool.query(
      `UPDATE public.validation_jobs SET status = 'queued', locked_at = NULL, locked_by = NULL
       WHERE submission_id = $1`,
      [submissionId],
    );
    await claim('worker-2');
    await acceptSubmission(submissionId, 50);

    const { rows } = await pool.query<{ total_points: number }>(
      `SELECT total_points FROM public.team_scores WHERE team_id = $1`,
      [team.teamId],
    );
    expect(Number(rows[0]!.total_points)).toBe(50);
  });

  it('кнопка перезапуска подбирает зависшее и потерянное', async () => {
    const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
    const stuckId = await queuedSubmission(team.teamId!, 1);

    const [job] = await claim('worker-1');
    await pool.query(
      `UPDATE public.validation_jobs SET locked_at = now() - interval '30 minutes' WHERE id = $1`,
      [job!.job_id],
    );

    // Отправка в pending, но задачи для неё нет вовсе.
    const orphanTask = await createTask(eventId, { number: 50, validationMode: 'ai' });
    const orphanSlot = await createSlot(team.teamId!, orphanTask);
    await confirmSubmission(orphanSlot.submissionId!, { aiAvailable: true });
    await pool.query(`DELETE FROM public.validation_jobs WHERE submission_id = $1`, [
      orphanSlot.submissionId,
    ]);

    const { rows } = await pool.query<{ r: { requeuedJobs: number } }>(
      `SELECT public.requeue_stale_validations($1, 5) AS r`,
      [eventId],
    );

    expect(rows[0]!.r.requeuedJobs).toBe(1);

    // Обе задачи снова в очереди.
    const claimed = await claim('worker-3', 10);
    const ids = claimed.map((j) => j.submission_id);
    expect(ids).toContain(stuckId);
    expect(ids).toContain(orphanSlot.submissionId);
  });
});

describe('рейтинг', () => {
  async function scoreTeam(name: string, points: number[]): Promise<string> {
    const team = await registerTeam(eventId, name, { bypassLimits: true });

    for (const [index, value] of points.entries()) {
      const taskId = await createTask(eventId, {
        number: Number(`${name.length}${index}${points.length}`) + index * 100 + 1,
        points: value,
      });
      const slot = await createSlot(team.teamId!, taskId);
      await confirmSubmission(slot.submissionId!);
      await acceptSubmission(slot.submissionId!, value);
    }

    return team.teamId!;
  }

  it('сортирует по сумме баллов', async () => {
    await scoreTeam('Первая', [50, 50]);
    await scoreTeam('Вторая', [30]);

    const { rows } = await pool.query<{ team_name: string; position: string }>(
      `SELECT team_name, position FROM public.leaderboard WHERE event_id = $1 ORDER BY position`,
      [eventId],
    );

    expect(rows[0]!.team_name).toBe('Первая');
    expect(rows[1]!.team_name).toBe('Вторая');
  });

  it('при равных баллах выше тот, кто взял больше заданий', async () => {
    await scoreTeam('Многозадачная', [30, 30]);
    await scoreTeam('Одноразовая', [60]);

    const { rows } = await pool.query<{ team_name: string; accepted_count: number }>(
      `SELECT team_name, accepted_count FROM public.leaderboard
       WHERE event_id = $1 ORDER BY position`,
      [eventId],
    );

    expect(rows[0]!.team_name).toBe('Многозадачная');
    expect(Number(rows[0]!.accepted_count)).toBe(2);
  });

  it('не показывает отменённые команды', async () => {
    const teamId = await scoreTeam('Снятая', [50]);
    await scoreTeam('Играющая', [30]);

    await pool.query(`UPDATE public.teams SET status = 'cancelled' WHERE id = $1`, [teamId]);

    const { rows } = await pool.query<{ team_name: string }>(
      `SELECT team_name FROM public.leaderboard WHERE event_id = $1`,
      [eventId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.team_name).toBe('Играющая');
  });

  it('пересчитывается после отмены начисления', async () => {
    const teamId = await scoreTeam('Команда', [50]);

    const { rows: before } = await pool.query<{ total_points: number }>(
      `SELECT total_points FROM public.team_scores WHERE team_id = $1`,
      [teamId],
    );
    expect(Number(before[0]!.total_points)).toBe(50);

    const { rows: submissions } = await pool.query<{ id: string }>(
      `SELECT id FROM public.submissions WHERE team_id = $1`,
      [teamId],
    );
    await pool.query(`SELECT public.revoke_submission($1, NULL, 'ошибка', 'rejected')`, [
      submissions[0]!.id,
    ]);

    const { rows: after } = await pool.query<{ total_points: number }>(
      `SELECT total_points FROM public.team_scores WHERE team_id = $1`,
      [teamId],
    );
    expect(Number(after[0]!.total_points)).toBe(0);
  });

  it('публичная витрина отдаёт строки только в режиме public', async () => {
    await scoreTeam('Команда', [50]);

    const visible = await pool.query(
      `SELECT * FROM public.leaderboard_public WHERE event_id = $1`,
      [eventId],
    );
    expect(visible.rows.length).toBe(1);

    await pool.query(`UPDATE public.events SET leaderboard_mode = 'hidden' WHERE id = $1`, [
      eventId,
    ]);

    const hidden = await pool.query(
      `SELECT * FROM public.leaderboard_public WHERE event_id = $1`,
      [eventId],
    );
    expect(hidden.rows.length).toBe(0);
  });

  it('в публичной витрине нет кодов и контактов', async () => {
    await scoreTeam('Команда', [50]);

    const { fields } = await pool.query(`SELECT * FROM public.leaderboard_public LIMIT 1`);
    const columns = fields.map((f) => f.name);

    expect(columns).not.toContain('join_code');
    expect(columns).not.toContain('contact');
    expect(columns).not.toContain('captain_name');
  });

  it('заморозка сохраняет снимок и переключает режим', async () => {
    await scoreTeam('Команда', [50]);

    await pool.query(`SELECT public.freeze_leaderboard($1)`, [eventId]);

    const { rows: snapshot } = await pool.query<{ team_name: string; total_points: number }>(
      `SELECT team_name, total_points FROM public.leaderboard_snapshots WHERE event_id = $1`,
      [eventId],
    );
    expect(snapshot).toHaveLength(1);
    expect(Number(snapshot[0]!.total_points)).toBe(50);

    const { rows: event } = await pool.query<{ leaderboard_mode: string }>(
      `SELECT leaderboard_mode FROM public.events WHERE id = $1`,
      [eventId],
    );
    expect(event[0]!.leaderboard_mode).toBe('frozen');
  });

  it('снимок не меняется после новых начислений', async () => {
    const teamId = await scoreTeam('Команда', [50]);
    await pool.query(`SELECT public.freeze_leaderboard($1)`, [eventId]);

    await pool.query(
      `SELECT public.adjust_team_score($1, 100, 'bonus', 'после заморозки', NULL)`,
      [teamId],
    );

    const { rows: snapshot } = await pool.query<{ total_points: number }>(
      `SELECT total_points FROM public.leaderboard_snapshots WHERE event_id = $1`,
      [eventId],
    );
    const { rows: live } = await pool.query<{ total_points: number }>(
      `SELECT total_points FROM public.team_scores WHERE team_id = $1`,
      [teamId],
    );

    expect(Number(snapshot[0]!.total_points)).toBe(50);
    expect(Number(live[0]!.total_points)).toBe(150);
  });

  it('разморозка удаляет снимок', async () => {
    await scoreTeam('Команда', [50]);
    await pool.query(`SELECT public.freeze_leaderboard($1)`, [eventId]);
    await pool.query(`SELECT public.unfreeze_leaderboard($1, 'public')`, [eventId]);

    const { rows } = await pool.query(
      `SELECT * FROM public.leaderboard_snapshots WHERE event_id = $1`,
      [eventId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('ограничение частоты', () => {
  it('пропускает запросы в пределах лимита и отсекает лишние', async () => {
    const results: boolean[] = [];

    for (let i = 0; i < 5; i += 1) {
      const { rows } = await pool.query<{ r: { allowed: boolean } }>(
        `SELECT public.touch_rate_limit('test:bucket', 60, 3) AS r`,
      );
      results.push(rows[0]!.r.allowed);
    }

    expect(results).toEqual([true, true, true, false, false]);
  });

  it('разные ключи считаются отдельно', async () => {
    await pool.query(`SELECT public.touch_rate_limit('a', 60, 1)`);

    const { rows } = await pool.query<{ r: { allowed: boolean } }>(
      `SELECT public.touch_rate_limit('b', 60, 1) AS r`,
    );
    expect(rows[0]!.r.allowed).toBe(true);
  });
});
