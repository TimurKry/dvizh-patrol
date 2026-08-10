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
  revokeSubmission,
  taskClaim,
  teamHand,
  teamScore,
} from '../helpers/db';

/**
 * Гонка команд за задание и рука из шести карточек.
 *
 * Главное, что здесь проверяется: задание забирает ровно одна
 * команда, и никакая параллельность этого не ломает. Проверка
 * идёт на настоящих одновременных транзакциях, а не на
 * последовательных вызовах — последовательные прошли бы и на
 * коде, где гарантии нет вовсе.
 */

let eventId: string;

beforeEach(async () => {
  await resetData();
  eventId = await createEvent({ status: 'live', registrationOpen: false });
});

afterAll(async () => {
  await closePool();
});

/** Команда с готовой к приёму отправкой по заданию. */
async function readySubmission(teamId: string, taskId: string): Promise<string> {
  const slot = await createSlot(teamId, taskId, `key-${teamId}-${taskId}`);
  await confirmSubmission(slot.submissionId!);
  return slot.submissionId!;
}

describe('цвет команды', () => {
  it('назначается автоматически и не повторяется', async () => {
    const colors: Array<string | null> = [];

    for (let i = 0; i < 6; i += 1) {
      const team = await registerTeam(eventId, `Команда ${i}`, { bypassLimits: true });
      const { rows } = await pool.query<{ color: string | null }>(
        `SELECT color FROM public.teams WHERE id = $1`,
        [team.teamId],
      );
      colors.push(rows[0]!.color);
    }

    expect(colors).toEqual(['red', 'green', 'blue', 'yellow', 'orange', 'pink']);
    expect(new Set(colors).size).toBe(6);
  });

  it('седьмая команда остаётся без цвета, но регистрируется', async () => {
    for (let i = 0; i < 6; i += 1) {
      await registerTeam(eventId, `Команда ${i}`, { bypassLimits: true });
    }

    const seventh = await registerTeam(eventId, 'Седьмая', { bypassLimits: true });
    expect(seventh.ok).toBe(true);

    const { rows } = await pool.query<{ color: string | null }>(
      `SELECT color FROM public.teams WHERE id = $1`,
      [seventh.teamId],
    );
    expect(rows[0]!.color).toBeNull();
  });

  it('отменённая команда освобождает цвет', async () => {
    const first = await registerTeam(eventId, 'Первая', { bypassLimits: true });
    await pool.query(`UPDATE public.teams SET status = 'cancelled' WHERE id = $1`, [first.teamId]);

    const second = await registerTeam(eventId, 'Вторая', { bypassLimits: true });
    const { rows } = await pool.query<{ color: string }>(
      `SELECT color FROM public.teams WHERE id = $1`,
      [second.teamId],
    );
    expect(rows[0]!.color).toBe('red');
  });
});

describe('рука из шести карточек', () => {
  beforeEach(async () => {
    // По четыре задания каждого типа: руке есть чем пополняться.
    let number = 1;
    for (const cardType of ['riddle', 'photo', 'active'] as const) {
      for (let i = 0; i < 4; i += 1) {
        await createTask(eventId, { number: number++, cardType, points: 50 });
      }
    }
  });

  it('выдаёт ровно два задания каждого типа', async () => {
    const team = await registerTeam(eventId, 'Рука', { bypassLimits: true });
    const hand = await teamHand(team.teamId!);

    expect(hand).toHaveLength(6);
    for (const cardType of ['riddle', 'photo', 'active'] as const) {
      expect(hand.filter((card) => card.cardType === cardType)).toHaveLength(2);
    }
  });

  it('не меняет состав руки при повторном запросе', async () => {
    const team = await registerTeam(eventId, 'Стабильность', { bypassLimits: true });

    const first = (await teamHand(team.teamId!)).map((card) => card.taskId).sort();
    const second = (await teamHand(team.teamId!)).map((card) => card.taskId).sort();

    expect(second).toEqual(first);
  });

  it('раздаёт разным командам разные руки', async () => {
    // Двенадцать заданий на две руки по шесть: полное совпадение
    // возможно, но крайне маловероятно. Проверяем, что раздача
    // вообще случайна, а не берёт первые шесть по порядку.
    const draws = new Set<string>();

    for (let i = 0; i < 6; i += 1) {
      await resetData();
      eventId = await createEvent({ status: 'live', registrationOpen: false });
      let number = 1;
      for (const cardType of ['riddle', 'photo', 'active'] as const) {
        for (let k = 0; k < 4; k += 1) {
          await createTask(eventId, { number: number++, cardType });
        }
      }
      const team = await registerTeam(eventId, `Команда ${i}`, { bypassLimits: true });
      const hand = await teamHand(team.teamId!);
      draws.add(
        hand
          .map((card) => card.taskId)
          .sort()
          .join(','),
      );
    }

    expect(draws.size).toBeGreaterThan(1);
  });

  it('не выдаёт задание, у которого исчерпаны попытки', async () => {
    const team = await registerTeam(eventId, 'Попытки', { bypassLimits: true });
    const hand = await teamHand(team.teamId!);
    const target = hand[0]!;

    // Две попытки по умолчанию: обе отклонены.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const slot = await createSlot(team.teamId!, target.taskId, `a${attempt}`);
      await confirmSubmission(slot.submissionId!);
      await revokeSubmission(slot.submissionId!);
    }

    const refreshed = await teamHand(team.teamId!);
    expect(refreshed.map((card) => card.taskId)).not.toContain(target.taskId);
    expect(refreshed).toHaveLength(6);
  });

  it('не раскрывает скрытый пул заданий', async () => {
    const team = await registerTeam(eventId, 'Пул', { bypassLimits: true });
    const hand = await teamHand(team.teamId!);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM public.tasks WHERE event_id = $1`,
      [eventId],
    );

    expect(Number(rows[0]!.count)).toBe(12);
    expect(hand).toHaveLength(6);
  });
});

describe('глобальный захват задания', () => {
  it('первая принятая отправка забирает задание', async () => {
    const taskId = await createTask(eventId, { points: 80 });
    const alpha = await registerTeam(eventId, 'Альфа', { bypassLimits: true });
    const submissionId = await readySubmission(alpha.teamId!, taskId);

    const result = await acceptSubmission(submissionId);

    expect(result.ok).toBe(true);
    const claim = await taskClaim(taskId);
    expect(claim.teamId).toBe(alpha.teamId);
    expect(claim.submissionId).toBe(submissionId);
  });

  it('вторая команда получает понятный отказ и ноль баллов', async () => {
    const taskId = await createTask(eventId, { points: 80 });
    const alpha = await registerTeam(eventId, 'Альфа', { bypassLimits: true });
    const beta = await registerTeam(eventId, 'Бета', { bypassLimits: true });

    const first = await readySubmission(alpha.teamId!, taskId);
    const second = await readySubmission(beta.teamId!, taskId);

    await acceptSubmission(first);
    const result = await acceptSubmission(second);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('task_claimed_by_other_team');
    expect(await teamScore(beta.teamId!)).toBe(0);
    expect(await teamScore(alpha.teamId!)).toBe(80);

    // Отправка не зависает в проверке: у неё конечный статус
    // и причина, которую можно показать команде.
    const { rows } = await pool.query<{ status: string; review_reason: string | null }>(
      `SELECT status, review_reason FROM public.submissions WHERE id = $1`,
      [second],
    );
    expect(rows[0]!.status).toBe('rejected');
    expect(rows[0]!.review_reason).toBe('task_claimed_by_other_team');
  });

  it('шесть одновременных приёмов начисляют баллы ровно одной команде', async () => {
    const taskId = await createTask(eventId, { points: 120 });

    const teams: string[] = [];
    const submissions: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const team = await registerTeam(eventId, `Гонка ${i}`, { bypassLimits: true });
      teams.push(team.teamId!);
      submissions.push(await readySubmission(team.teamId!, taskId));
    }

    // Каждый приём — своё соединение и своя транзакция, стартующие
    // максимально близко друг к другу. Последовательные вызовы
    // прошли бы и без всяких гарантий.
    const clients = await Promise.all(submissions.map(() => pool.connect()));

    const results = await Promise.all(
      clients.map(async (client, index) => {
        try {
          await client.query('BEGIN');
          const { rows } = await client.query<{ r: { ok: boolean; error?: string } }>(
            `SELECT public.accept_submission($1,$2,$3,$4,$5) AS r`,
            [submissions[index], null, null, 'race', null],
          );
          await client.query('COMMIT');
          return rows[0]!.r;
        } catch (error) {
          await client.query('ROLLBACK');
          // Проигравшая транзакция может упасть на уникальном
          // индексе — это тоже корректный исход гонки.
          return { ok: false, error: (error as Error).message };
        } finally {
          client.release();
        }
      }),
    );

    const winners = results.filter((result) => result.ok);
    expect(winners).toHaveLength(1);

    // Ни одного лишнего начисления в журнале.
    const { rows: ledger } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM public.score_transactions
       WHERE transaction_type = 'task_accepted' AND reversed_by_transaction_id IS NULL`,
    );
    expect(Number(ledger[0]!.count)).toBe(1);

    const scores = await Promise.all(teams.map((teamId) => teamScore(teamId)));
    expect(scores.filter((score) => score > 0)).toEqual([120]);
    expect(scores.reduce((sum, score) => sum + score, 0)).toBe(120);
  });

  it('после захвата карточка исчезает с рук всех команд', async () => {
    let number = 1;
    for (const cardType of ['riddle', 'photo', 'active'] as const) {
      for (let i = 0; i < 3; i += 1) {
        await createTask(eventId, { number: number++, cardType });
      }
    }

    const alpha = await registerTeam(eventId, 'Альфа', { bypassLimits: true });
    const beta = await registerTeam(eventId, 'Бета', { bypassLimits: true });

    const alphaHand = await teamHand(alpha.teamId!);
    await teamHand(beta.teamId!);

    const target = alphaHand[0]!;
    const submissionId = await readySubmission(alpha.teamId!, target.taskId);
    await acceptSubmission(submissionId);

    const alphaAfter = await teamHand(alpha.teamId!);
    const betaAfter = await teamHand(beta.teamId!);

    expect(alphaAfter.map((card) => card.taskId)).not.toContain(target.taskId);
    expect(betaAfter.map((card) => card.taskId)).not.toContain(target.taskId);

    // Рука пополнилась: обе команды снова держат шесть карточек.
    expect(alphaAfter).toHaveLength(6);
    expect(betaAfter).toHaveLength(6);
  });

  it('отмена возвращает задание в общий пул', async () => {
    const taskId = await createTask(eventId, { points: 40, maxAttempts: 3 });
    const alpha = await registerTeam(eventId, 'Альфа', { bypassLimits: true });
    const beta = await registerTeam(eventId, 'Бета', { bypassLimits: true });

    const first = await readySubmission(alpha.teamId!, taskId);
    await acceptSubmission(first);
    expect((await taskClaim(taskId)).teamId).toBe(alpha.teamId);

    const revoked = await revokeSubmission(first);
    expect(revoked.ok).toBe(true);
    expect((await taskClaim(taskId)).teamId).toBeNull();

    // Теперь задание может забрать другая команда.
    const second = await readySubmission(beta.teamId!, taskId);
    const result = await acceptSubmission(second);

    expect(result.ok).toBe(true);
    expect((await taskClaim(taskId)).teamId).toBe(beta.teamId);
    expect(await teamScore(alpha.teamId!)).toBe(0);
    expect(await teamScore(beta.teamId!)).toBe(40);
  });

  it('повторный приём той же отправки не начисляет баллы дважды', async () => {
    const taskId = await createTask(eventId, { points: 60 });
    const alpha = await registerTeam(eventId, 'Альфа', { bypassLimits: true });
    const submissionId = await readySubmission(alpha.teamId!, taskId);

    const first = await acceptSubmission(submissionId);
    const second = await acceptSubmission(submissionId);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.alreadyAccepted).toBe(true);
    expect(await teamScore(alpha.teamId!)).toBe(60);
  });

  it('баллы берутся из задания, а не из константы', async () => {
    const cheap = await createTask(eventId, { number: 1, points: 15 });
    const rich = await createTask(eventId, { number: 2, points: 240 });
    const team = await registerTeam(eventId, 'Баллы', { bypassLimits: true });

    await acceptSubmission(await readySubmission(team.teamId!, cheap));
    await acceptSubmission(await readySubmission(team.teamId!, rich));

    expect(await teamScore(team.teamId!)).toBe(255);
  });
});
