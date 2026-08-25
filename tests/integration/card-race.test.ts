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
  setTeamTest,
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

/**
 * Тестовая команда.
 *
 * Организатору нужно пройти квест до квеста: проверить каждое
 * задание, посмотреть его глазами участника, убедиться, что
 * загадка разгадывается. Раньше для этого приходилось запускать
 * мероприятие — то есть открывать задания всем, кто уже вошёл.
 *
 * Главное требование: проверка не должна уносить задания из пула.
 * Иначе к вечеру играть будет нечем.
 */
describe('тестовая команда', () => {
  it('получает на руки весь пул, а не шесть карточек', async () => {
    const id = await createEvent({ status: 'live', startsIn: '-1 hour' });
    for (let n = 1; n <= 12; n += 1) {
      await createTask(id, {
        number: n,
        cardType: (['riddle', 'photo', 'active'] as const)[n % 3],
      });
    }

    const real = await registerTeam(id, 'Настоящие', { bypassLimits: true });
    const test = await registerTeam(id, 'Тестовая', { bypassLimits: true });
    await setTeamTest(test.teamId!, true);

    expect(await teamHand(real.teamId!)).toHaveLength(6);
    expect(await teamHand(test.teamId!)).toHaveLength(12);
  });

  it('принятая у неё отправка не забирает задание из пула', async () => {
    const id = await createEvent({ status: 'live', startsIn: '-1 hour' });
    const task = await createTask(id, { number: 1, points: 50 });

    const test = await registerTeam(id, 'Тестовая', { bypassLimits: true });
    await setTeamTest(test.teamId!, true);

    const slot = await createSlot(test.teamId!, task);
    await confirmSubmission(slot.submissionId!);
    const accepted = await acceptSubmission(slot.submissionId!);
    expect(accepted.ok).toBe(true);

    // Задание свободно: вечером его должна получить настоящая команда.
    expect((await taskClaim(task)).teamId).toBeNull();

    const real = await registerTeam(id, 'Настоящие', { bypassLimits: true });
    const realSlot = await createSlot(real.teamId!, task);
    await confirmSubmission(realSlot.submissionId!);
    const realAccepted = await acceptSubmission(realSlot.submissionId!);
    expect(realAccepted.ok, 'настоящая команда не смогла забрать задание').toBe(true);
    expect((await taskClaim(task)).teamId).toBe(real.teamId);
  });

  it('играет до старта мероприятия, а обычная — нет', async () => {
    const id = await createEvent({ status: 'draft' });
    const task = await createTask(id, { number: 1 });

    const test = await registerTeam(id, 'Тестовая', { bypassLimits: true });
    await setTeamTest(test.teamId!, true);
    const real = await registerTeam(id, 'Настоящие', { bypassLimits: true });

    expect((await createSlot(test.teamId!, task)).ok).toBe(true);
    const refused = await createSlot(real.teamId!, task);
    expect(refused.ok).toBe(false);
    expect(refused.error).toBe('event_not_live');
  });

  it('не попадает в рейтинг', async () => {
    const id = await createEvent({ status: 'live', startsIn: '-1 hour' });
    const task = await createTask(id, { number: 1, points: 50 });

    const test = await registerTeam(id, 'Тестовая', { bypassLimits: true });
    await setTeamTest(test.teamId!, true);

    const slot = await createSlot(test.teamId!, task);
    await confirmSubmission(slot.submissionId!);
    await acceptSubmission(slot.submissionId!);

    // Баллы у неё есть — организатор их видит в карточке.
    expect(await teamScore(test.teamId!)).toBe(50);

    // А в таблице результатов её нет.
    const { rows } = await pool.query<{ team_name: string }>(
      `SELECT team_name FROM public.leaderboard WHERE event_id = $1`,
      [id],
    );
    expect(rows.map((r) => r.team_name)).not.toContain('Тестовая');
  });
});

/**
 * Скрытые критерии.
 *
 * Критерии проверки видит команда — и правильно: человек должен
 * понимать, что от него хотят. Но у загадки это ломает игру:
 * критерий «на фото памятник Фаусту» — готовый ответ под условием.
 * Из-за этого все семнадцать загадок стояли на ручной проверке.
 *
 * Проверяется главное свойство: скрытое остаётся скрытым. Рука
 * команды приходит из `get_team_hand`, и всё, что она вернёт,
 * уезжает в браузер.
 */
describe('скрытые критерии', () => {
  it('в руку команды не попадают', async () => {
    const id = await createEvent({ status: 'live', startsIn: '-1 hour' });
    const task = await createTask(id, { number: 1, criteria: ['Видно вход'] });

    await pool.query(
      `UPDATE public.tasks SET hidden_criteria = '["В кадре памятник Фаусту"]'::jsonb WHERE id = $1`,
      [task],
    );

    const team = await registerTeam(id, 'Любопытные', { bypassLimits: true });
    const { rows } = await pool.query<{ r: unknown }>(`SELECT public.get_team_hand($1) AS r`, [
      team.teamId,
    ]);

    const payload = JSON.stringify(rows[0]!.r);
    expect(payload).toContain('Видно вход');
    expect(payload, 'ответ к загадке уехал в руку команды').not.toContain('Фауст');
    expect(payload).not.toContain('hidden');
  });

  it('хранятся у задания и достаются серверу', async () => {
    const id = await createEvent({ status: 'registration' });
    const task = await createTask(id, { number: 1 });

    await pool.query(
      `UPDATE public.tasks SET hidden_criteria = '["Ответ", "Второй признак"]'::jsonb WHERE id = $1`,
      [task],
    );

    const { rows } = await pool.query<{ hidden_criteria: string[] }>(
      `SELECT hidden_criteria FROM public.tasks WHERE id = $1`,
      [task],
    );
    expect(rows[0]!.hidden_criteria).toEqual(['Ответ', 'Второй признак']);
  });

  it('по умолчанию пусты — старые задания не ломаются', async () => {
    const id = await createEvent({ status: 'registration' });
    const task = await createTask(id, { number: 1 });

    const { rows } = await pool.query<{ hidden_criteria: string[] }>(
      `SELECT hidden_criteria FROM public.tasks WHERE id = $1`,
      [task],
    );
    expect(rows[0]!.hidden_criteria).toEqual([]);
  });
});

/**
 * Скрытые критерии переживают повторный импорт.
 *
 * Организатор вписывает ответы к семнадцати загадкам руками. Если
 * после этого он зальёт обновлённый файл заданий — а он зальёт, —
 * работа не должна пропасть. В файле импорта колонки скрытых
 * критериев нет, и запрос обновления её не упоминает: Postgres в
 * `ON CONFLICT DO UPDATE` трогает только перечисленные колонки.
 *
 * Проверяется тем же запросом, какой строит PostgREST для upsert
 * по `event_id,number` — тем, через который идёт настоящий импорт.
 */
describe('импорт и скрытые критерии', () => {
  it('повторная заливка не стирает вписанные ответы', async () => {
    const id = await createEvent({ status: 'registration' });
    const task = await createTask(id, { number: 7, title: 'Загадка' });

    await pool.query(
      `UPDATE public.tasks SET hidden_criteria = '["Памятник Фаусту"]'::jsonb WHERE id = $1`,
      [task],
    );

    // Ровно то, что уходит в базу при импорте: колонок скрытых
    // критериев в списке нет.
    await pool.query(
      `INSERT INTO public.tasks
         (event_id, number, title, description, points, category, difficulty,
          validation_mode, criteria, max_attempts, active, sort_order, card_type)
       VALUES ($1, 7, 'Загадка, переписанная в файле', 'Новое описание', 120,
               'monuments', 'medium', 'ai', '["Открытый критерий"]'::jsonb, 3, true, 7, 'riddle')
       ON CONFLICT (event_id, number) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         points = excluded.points,
         criteria = excluded.criteria`,
      [id],
    );

    const { rows } = await pool.query<{ title: string; hidden_criteria: string[] }>(
      `SELECT title, hidden_criteria FROM public.tasks WHERE event_id = $1 AND number = 7`,
      [id],
    );

    expect(rows[0]!.title).toBe('Загадка, переписанная в файле');
    expect(rows[0]!.hidden_criteria, 'импорт стёр ответ к загадке').toEqual(['Памятник Фаусту']);
  });
});
