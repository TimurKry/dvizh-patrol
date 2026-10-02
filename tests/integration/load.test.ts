import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, createEvent, joinTeam, pool, registerTeam, resetData } from '../helpers/db';

/**
 * Нагрузка масштаба мероприятия.
 *
 * Ровно те цифры, что заявлены в требованиях: 10 команд,
 * 40 участников, 50 заданий, 500 отправок. Проверяем не скорость
 * ради скорости, а что при полном заполнении не разъезжаются
 * баллы и не разваливаются выборки, на которые смотрит
 * организатор во время квеста.
 */

const TEAMS = 10;
const MEMBERS_PER_TEAM = 4;
const TASKS = 50;

let eventId: string;
const teamIds: string[] = [];
const taskIds: string[] = [];

beforeAll(async () => {
  await resetData();
  eventId = await createEvent({
    status: 'live',
    maxTeams: TEAMS,
    teamSize: MEMBERS_PER_TEAM,
    registrationOpen: false,
  });

  // Команды и участники.
  for (let t = 1; t <= TEAMS; t += 1) {
    const team = await registerTeam(eventId, `Команда ${t}`, { bypassLimits: true });
    teamIds.push(team.teamId!);

    for (let m = 2; m <= MEMBERS_PER_TEAM; m += 1) {
      await joinTeam(eventId, team.joinCode!, `Участник ${t}-${m}`);
    }
  }

  // Пятьдесят заданий одной вставкой.
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO public.tasks
       (event_id, number, title, description, points, category, difficulty,
        validation_mode, criteria, max_attempts, sort_order)
     SELECT $1, n, 'Задание ' || n, 'Описание задания ' || n,
            30 + (n % 7) * 10, 'object_search', 'medium',
            'manual', '["Критерий"]'::jsonb, 2, n
     FROM generate_series(1, $2) AS n
     RETURNING id`,
    [eventId, TASKS],
  );
  taskIds.push(...rows.map((r) => r.id));
}, 120_000);

afterAll(async () => {
  await closePool();
});

describe('масштаб мероприятия', () => {
  it('вмещает десять команд и сорок участников', async () => {
    const { rows } = await pool.query<{ teams: string; members: string }>(
      `SELECT
         (SELECT count(*) FROM public.teams WHERE event_id = $1) AS teams,
         (SELECT count(*) FROM public.team_members m
          JOIN public.teams t ON t.id = m.team_id WHERE t.event_id = $1) AS members`,
      [eventId],
    );

    expect(Number(rows[0]!.teams)).toBe(TEAMS);
    expect(Number(rows[0]!.members)).toBe(TEAMS * MEMBERS_PER_TEAM);
  });

  it('держит пятьдесят активных заданий', async () => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.tasks WHERE event_id = $1 AND active`,
      [eventId],
    );
    expect(Number(rows[0]!.count)).toBe(TASKS);
  });

  it('принимает пятьсот отправок и не путает баллы', async () => {
    // Каждая команда отправляет по каждому заданию: 10 × 50 = 500.
    await pool.query(
      // Приведения обязательны: оператор || не определён для uuid,
      // а параметр без типа Postgres считает unknown.
      `INSERT INTO public.submissions
         (event_id, team_id, task_id, status, attempt_number, image_path, submitted_at)
       SELECT $1::uuid, t.id, tk.id, 'manual_review', 1,
              'events/' || $1::text || '/teams/' || t.id::text
                || '/tasks/' || tk.id::text || '/x.webp',
              now() - (random() * interval '3 hours')
       FROM public.teams t
       CROSS JOIN public.tasks tk
       WHERE t.event_id = $1::uuid AND tk.event_id = $1::uuid`,
      [eventId],
    );

    const { rows: total } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.submissions WHERE event_id = $1`,
      [eventId],
    );
    expect(Number(total[0]!.count)).toBe(TEAMS * TASKS);

    // Принимаем половину отправок подряд. Задание глобальное:
    // сколько бы команд его ни прислало, забирает первая, а
    // остальные получают отказ. Поэтому принятых будет ровно
    // столько, сколько разных заданий попало в эту половину, —
    // не 250, как было при правиле «одно задание на команду».
    const { rows: toAccept } = await pool.query<{ id: string; task_id: string }>(
      `SELECT id, task_id FROM public.submissions
       WHERE event_id = $1 ORDER BY submitted_at LIMIT $2`,
      [eventId, (TEAMS * TASKS) / 2],
    );

    for (const row of toAccept) {
      await pool.query(`SELECT public.accept_submission($1, NULL, NULL, 'load-test', NULL)`, [
        row.id,
      ]);
    }

    const distinctTasks = new Set(toAccept.map((row) => row.task_id)).size;

    const { rows: accepted } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.submissions WHERE event_id = $1 AND status = 'accepted'`,
      [eventId],
    );
    expect(Number(accepted[0]!.count)).toBe(distinctTasks);

    // И ни одно задание не забрали дважды.
    const { rows: claimed } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.tasks
       WHERE event_id = $1 AND claimed_by_team_id IS NOT NULL`,
      [eventId],
    );
    expect(Number(claimed[0]!.count)).toBe(distinctTasks);

    // Сумма баллов по журналу совпадает с суммой по отправкам.
    const { rows: check } = await pool.query<{ from_log: string; from_submissions: string }>(
      `SELECT
         (SELECT COALESCE(sum(points), 0) FROM public.score_transactions WHERE event_id = $1)
           AS from_log,
         (SELECT COALESCE(sum(awarded_points), 0) FROM public.submissions
          WHERE event_id = $1 AND status = 'accepted') AS from_submissions`,
      [eventId],
    );

    expect(Number(check[0]!.from_log)).toBe(Number(check[0]!.from_submissions));
    expect(Number(check[0]!.from_log)).toBeGreaterThan(0);
  }, 120_000);

  it('не допускает двух начислений на одну отправку', async () => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM (
         SELECT submission_id
         FROM public.score_transactions
         WHERE transaction_type = 'task_accepted' AND reversed_by_transaction_id IS NULL
         GROUP BY submission_id
         HAVING count(*) > 1
       ) AS duplicates`,
    );

    expect(Number(rows[0]!.count)).toBe(0);
  });

  it('не допускает двух принятых отправок по одному заданию', async () => {
    // Группировка по одному task_id, без team_id: задание
    // забирает ровно одна команда во всём мероприятии.
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM (
         SELECT task_id
         FROM public.submissions
         WHERE status = 'accepted'
         GROUP BY task_id
         HAVING count(*) > 1
       ) AS duplicates`,
    );

    expect(Number(rows[0]!.count)).toBe(0);
  });

  it('рейтинг на полном наборе данных считается быстро', async () => {
    const started = Date.now();
    const { rows } = await pool.query(
      `SELECT * FROM public.leaderboard WHERE event_id = $1 ORDER BY position`,
      [eventId],
    );
    const elapsed = Date.now() - started;

    expect(rows).toHaveLength(TEAMS);
    // На таком объёме запрос обязан укладываться в доли секунды.
    expect(elapsed).toBeLessThan(1500);
  });

  it('очередь проверки открывается быстро', async () => {
    const started = Date.now();
    const { rows } = await pool.query(
      `SELECT s.*, t.number, t.title
       FROM public.submissions s
       JOIN public.tasks t ON t.id = s.task_id
       WHERE s.event_id = $1 AND s.status = 'manual_review'
       ORDER BY s.submitted_at
       LIMIT 40`,
      [eventId],
    );
    const elapsed = Date.now() - started;

    expect(rows).toHaveLength(40);
    expect(elapsed).toBeLessThan(1500);
  });

  it('сводка админки собирается быстро', async () => {
    const started = Date.now();
    const { rows } = await pool.query<{ submissions_total: number }>(
      `SELECT * FROM public.admin_dashboard WHERE event_id = $1`,
      [eventId],
    );
    const elapsed = Date.now() - started;

    expect(Number(rows[0]!.submissions_total)).toBe(TEAMS * TASKS);
    expect(elapsed).toBeLessThan(2000);
  });

  it('прогресс каждой команды сходится с отправками', async () => {
    const { rows } = await pool.query<{
      team_id: string;
      accepted: number;
      manual_review: number;
    }>(`SELECT team_id, accepted, manual_review FROM public.team_progress`);

    expect(rows).toHaveLength(TEAMS);

    for (const row of rows) {
      const { rows: actual } = await pool.query<{ count: string }>(
        `SELECT count(*) FROM public.submissions WHERE team_id = $1 AND status = 'accepted'`,
        [row.team_id],
      );
      expect(Number(row.accepted)).toBe(Number(actual[0]!.count));
    }
  });
});
