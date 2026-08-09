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
  teamScore,
} from '../helpers/db';

/**
 * Отправки и начисление баллов.
 *
 * Здесь проверяется главная гарантия системы: повторный запрос
 * никогда не начисляет баллы дважды, а отмена не стирает историю.
 */

let eventId: string;
let teamId: string;
let taskId: string;

beforeEach(async () => {
  await resetData();
  eventId = await createEvent({ status: 'live', registrationOpen: false });
  const team = await registerTeam(eventId, 'Команда', { bypassLimits: true });
  teamId = team.teamId!;
  taskId = await createTask(eventId, { points: 50, maxAttempts: 2 });
});

afterAll(async () => {
  await closePool();
});

describe('создание отправки', () => {
  it('создаёт слот в статусе uploading', async () => {
    const slot = await createSlot(teamId, taskId);

    expect(slot.ok).toBe(true);
    expect(slot.attemptNumber).toBe(1);

    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM public.submissions WHERE id = $1`,
      [slot.submissionId],
    );
    expect(rows[0]!.status).toBe('uploading');
  });

  it('не создаёт отправку, пока квест не запущен', async () => {
    await pool.query(`UPDATE public.events SET status = 'registration' WHERE id = $1`, [eventId]);

    const slot = await createSlot(teamId, taskId);
    expect(slot.error).toBe('event_not_live');
  });

  it('не создаёт отправку по выключённому заданию', async () => {
    await pool.query(`UPDATE public.tasks SET active = false WHERE id = $1`, [taskId]);

    expect((await createSlot(teamId, taskId)).error).toBe('task_inactive');
  });

  it('не принимает задание из другого мероприятия', async () => {
    const otherEvent = await createEvent({ slug: 'other-event', status: 'live' });
    const foreignTask = await createTask(otherEvent, { number: 99 });

    expect((await createSlot(teamId, foreignTask)).error).toBe('task_event_mismatch');
  });

  it('повторный запрос с тем же ключом возвращает ту же отправку', async () => {
    const first = await createSlot(teamId, taskId, 'ключ-1');
    const second = await createSlot(teamId, taskId, 'ключ-1');

    expect(second.submissionId).toBe(first.submissionId);
    expect(second.reused).toBe(true);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.submissions WHERE team_id = $1 AND task_id = $2`,
      [teamId, taskId],
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });

  it('считает попытки и не даёт превысить лимит', async () => {
    const first = await createSlot(teamId, taskId, 'ключ-1');
    await confirmSubmission(first.submissionId!);

    const second = await createSlot(teamId, taskId, 'ключ-2');
    expect(second.attemptNumber).toBe(2);
    await confirmSubmission(second.submissionId!);

    const third = await createSlot(teamId, taskId, 'ключ-3');
    expect(third.error).toBe('attempt_limit_reached');
  });

  it('неудачная загрузка попытку не тратит', async () => {
    const first = await createSlot(teamId, taskId, 'ключ-1');
    await pool.query(`UPDATE public.submissions SET status = 'upload_failed' WHERE id = $1`, [
      first.submissionId,
    ]);

    const second = await createSlot(teamId, taskId, 'ключ-2');
    expect(second.ok).toBe(true);
    expect(second.attemptNumber).toBe(1);
  });

  it('после принятия новую отправку не создаёт', async () => {
    const slot = await createSlot(teamId, taskId, 'ключ-1');
    await confirmSubmission(slot.submissionId!);
    await acceptSubmission(slot.submissionId!);

    expect((await createSlot(teamId, taskId, 'ключ-2')).error).toBe('already_accepted');
  });
});

describe('маршрутизация после загрузки', () => {
  it('режим auto принимает сразу и начисляет баллы', async () => {
    const autoTask = await createTask(eventId, { number: 2, validationMode: 'auto', points: 30 });
    const slot = await createSlot(teamId, autoTask);

    const result = await confirmSubmission(slot.submissionId!);

    expect(result.status).toBe('accepted');
    expect(await teamScore(teamId)).toBe(30);
  });

  it('режим manual отправляет к организатору', async () => {
    const slot = await createSlot(teamId, taskId);
    const result = await confirmSubmission(slot.submissionId!);

    expect(result.status).toBe('manual_review');
    expect(result.reviewReason).toBe('manual_mode');
  });

  it('режим ai ставит задачу в очередь, когда проверка доступна', async () => {
    const aiTask = await createTask(eventId, { number: 3, validationMode: 'ai' });
    const slot = await createSlot(teamId, aiTask);

    const result = await confirmSubmission(slot.submissionId!, { aiAvailable: true });

    expect(result.status).toBe('pending');

    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM public.validation_jobs WHERE submission_id = $1`,
      [slot.submissionId],
    );
    expect(rows[0]!.status).toBe('queued');
  });

  it('без доступной проверки режим ai уходит к человеку', async () => {
    const aiTask = await createTask(eventId, { number: 4, validationMode: 'ai' });
    const slot = await createSlot(teamId, aiTask);

    const result = await confirmSubmission(slot.submissionId!, { aiAvailable: false });

    expect(result.status).toBe('manual_review');
    expect(result.reviewReason).toBe('ai_unavailable');
  });

  it('похожая фотография уходит к человеку, а не отклоняется', async () => {
    const otherTask = await createTask(eventId, { number: 5 });
    const firstSlot = await createSlot(teamId, otherTask);
    await confirmSubmission(firstSlot.submissionId!, { hash: '0f0f0f0f0f0f0f0f' });

    const slot = await createSlot(teamId, taskId);
    const result = await confirmSubmission(slot.submissionId!, {
      duplicateOf: firstSlot.submissionId,
      similarity: 0.98,
      hash: '0f0f0f0f0f0f0f0f',
    });

    expect(result.status).toBe('manual_review');
    expect(result.reviewReason).toBe('possible_duplicate');
  });

  it('повторное подтверждение ничего не ломает', async () => {
    const slot = await createSlot(teamId, taskId);

    await confirmSubmission(slot.submissionId!);
    const second = await confirmSubmission(slot.submissionId!);

    expect(second.ok).toBe(true);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.score_transactions WHERE team_id = $1`,
      [teamId],
    );
    expect(Number(rows[0]!.count)).toBe(0);
  });
});

describe('начисление баллов', () => {
  async function preparedSubmission(): Promise<string> {
    const slot = await createSlot(teamId, taskId);
    await confirmSubmission(slot.submissionId!);
    return slot.submissionId!;
  }

  it('начисляет баллы задания', async () => {
    const id = await preparedSubmission();
    const result = await acceptSubmission(id);

    expect(result.ok).toBe(true);
    expect(result.points).toBe(50);
    expect(await teamScore(teamId)).toBe(50);
  });

  it('позволяет принять с другими баллами', async () => {
    const id = await preparedSubmission();
    await acceptSubmission(id, 25);

    expect(await teamScore(teamId)).toBe(25);
  });

  it('повторное принятие не начисляет второй раз', async () => {
    const id = await preparedSubmission();

    const first = await acceptSubmission(id);
    const second = await acceptSubmission(id);

    expect(first.alreadyAccepted).toBe(false);
    expect(second.alreadyAccepted).toBe(true);
    expect(await teamScore(teamId)).toBe(50);
  });

  it('параллельные принятия начисляют ровно один раз', async () => {
    const id = await preparedSubmission();

    // Организатор дважды нажал кнопку, или воркер продублировал вызов.
    await Promise.all(Array.from({ length: 8 }, () => acceptSubmission(id)));

    expect(await teamScore(teamId)).toBe(50);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.score_transactions
       WHERE submission_id = $1 AND transaction_type = 'task_accepted'`,
      [id],
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });

  it('не принимает вторую отправку по уже засчитанному заданию', async () => {
    const first = await createSlot(teamId, taskId, 'ключ-1');
    await confirmSubmission(first.submissionId!);
    await acceptSubmission(first.submissionId!);

    // Вторую отправку создаём в обход (например, она уже была в очереди).
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO public.submissions (event_id, team_id, task_id, status, attempt_number, image_path)
       VALUES ($1, $2, $3, 'manual_review', 2, 'x.webp') RETURNING id`,
      [eventId, teamId, taskId],
    );

    const result = await acceptSubmission(rows[0]!.id);
    expect(result.error).toBe('task_already_accepted');
    expect(await teamScore(teamId)).toBe(50);
  });

  it('не принимает отрицательные баллы', async () => {
    const id = await preparedSubmission();
    expect((await acceptSubmission(id, -10)).error).toBe('negative_points');
  });
});

describe('отмена начисления', () => {
  async function acceptedSubmission(): Promise<string> {
    const slot = await createSlot(teamId, taskId);
    await confirmSubmission(slot.submissionId!);
    await acceptSubmission(slot.submissionId!);
    return slot.submissionId!;
  }

  it('снимает баллы обратной транзакцией, не удаляя исходную', async () => {
    const id = await acceptedSubmission();
    expect(await teamScore(teamId)).toBe(50);

    const result = await revokeSubmission(id);

    expect(result.reversed).toBe(true);
    expect(await teamScore(teamId)).toBe(0);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.score_transactions WHERE submission_id = $1`,
      [id],
    );
    // Обе строки на месте: журнал не переписывается.
    expect(Number(rows[0]!.count)).toBe(2);
  });

  it('связывает отменённую транзакцию с обратной', async () => {
    const id = await acceptedSubmission();
    await revokeSubmission(id);

    const { rows } = await pool.query<{
      transaction_type: string;
      reverses_transaction_id: string | null;
      reversed_by_transaction_id: string | null;
    }>(
      `SELECT transaction_type, reverses_transaction_id, reversed_by_transaction_id
       FROM public.score_transactions WHERE submission_id = $1 ORDER BY created_at`,
      [id],
    );

    const [original, reversal] = rows;
    expect(original!.reversed_by_transaction_id).not.toBeNull();
    expect(reversal!.reverses_transaction_id).not.toBeNull();
    expect(reversal!.transaction_type).toBe('submission_revoked');
  });

  it('позволяет принять задание заново после отмены', async () => {
    const id = await acceptedSubmission();
    await revokeSubmission(id);

    const result = await acceptSubmission(id);

    expect(result.ok).toBe(true);
    expect(result.alreadyAccepted).toBe(false);
    expect(await teamScore(teamId)).toBe(50);
  });

  it('повторная отмена не уводит счёт в минус', async () => {
    const id = await acceptedSubmission();

    await revokeSubmission(id);
    await revokeSubmission(id);

    expect(await teamScore(teamId)).toBe(0);
  });

  it('отмена неначисленной отправки безопасна', async () => {
    const slot = await createSlot(teamId, taskId);
    await confirmSubmission(slot.submissionId!);

    const result = await revokeSubmission(slot.submissionId!);

    expect(result.ok).toBe(true);
    expect(result.reversed).toBe(false);
    expect(await teamScore(teamId)).toBe(0);
  });
});

describe('ручные корректировки', () => {
  it('начисляет бонус и штраф', async () => {
    await pool.query(`SELECT public.adjust_team_score($1, 20, 'bonus', 'за креатив', NULL)`, [
      teamId,
    ]);
    expect(await teamScore(teamId)).toBe(20);

    await pool.query(`SELECT public.adjust_team_score($1, -5, 'penalty', 'опоздание', NULL)`, [
      teamId,
    ]);
    expect(await teamScore(teamId)).toBe(15);
  });

  it('требует причину', async () => {
    const { rows } = await pool.query<{ r: { ok: boolean; error?: string } }>(
      `SELECT public.adjust_team_score($1, 10, 'bonus', '  ', NULL) AS r`,
      [teamId],
    );
    expect(rows[0]!.r.error).toBe('reason_required');
  });

  it('не даёт использовать служебные типы транзакций', async () => {
    const { rows } = await pool.query<{ r: { ok: boolean; error?: string } }>(
      `SELECT public.adjust_team_score($1, 10, 'task_accepted', 'обход', NULL) AS r`,
      [teamId],
    );
    expect(rows[0]!.r.error).toBe('invalid_transaction_type');
  });
});

describe('игровое поле', () => {
  /**
   * Главное здесь — что снимок снаружи поля не засчитывается сам.
   * Задание с автоприёмом обычно начисляет баллы без человека;
   * если бы ветка поля стояла ниже проверки validation_mode,
   * ограничение не значило бы ровно ничего.
   */
  it('снаружи поля задание с автоприёмом не начисляет баллы', async () => {
    const autoTask = await createTask(eventId, {
      number: 2,
      points: 40,
      validationMode: 'auto',
    });
    const slot = await createSlot(teamId, autoTask);

    const result = await confirmSubmission(slot.submissionId!, { outsideArea: true });

    expect(result.status).toBe('manual_review');
    expect(result.reviewReason).toBe('outside_play_area');
    expect(await teamScore(teamId)).toBe(0);
  });

  it('внутри поля автоприём работает как обычно', async () => {
    const autoTask = await createTask(eventId, {
      number: 3,
      points: 40,
      validationMode: 'auto',
    });
    const slot = await createSlot(teamId, autoTask);

    const result = await confirmSubmission(slot.submissionId!, { outsideArea: false });

    expect(result.status).toBe('accepted');
    expect(await teamScore(teamId)).toBe(40);
  });

  it('снаружи поля фотография не отклоняется, а ждёт организатора', async () => {
    const slot = await createSlot(teamId, taskId);
    const result = await confirmSubmission(slot.submissionId!, {
      outsideArea: true,
      aiAvailable: true,
    });

    // Не «rejected»: машина зовёт человека, но не отказывает.
    expect(result.status).toBe('manual_review');
    expect(result.reviewReason).toBe('outside_play_area');
  });

  it('похожий снимок важнее выхода за поле', async () => {
    // Обе причины ведут к ручной проверке, но дубликат опаснее
    // для честности баллов — организатор должен увидеть именно его.
    const first = await createSlot(teamId, taskId);
    await confirmSubmission(first.submissionId!, { hash: 'a'.repeat(16) });

    const second = await createSlot(teamId, taskId);
    const result = await confirmSubmission(second.submissionId!, {
      duplicateOf: first.submissionId,
      similarity: 0.99,
      outsideArea: true,
    });

    expect(result.reviewReason).toBe('possible_duplicate');
  });
});
