import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptSubmission,
  closePool,
  confirmSubmission,
  createEvent,
  createSlot,
  createTask,
  deleteTeam,
  joinTeam,
  pool,
  registerTeam,
  resetData,
  setTeamSize,
  taskClaim,
} from '../helpers/db';

/**
 * Регистрация команд и участников.
 *
 * Самая опасная часть системы: два человека жмут «Создать
 * команду» одновременно, и без правильной блокировки появляется
 * одиннадцатая команда. Проверяем это настоящими параллельными
 * соединениями, а не последовательными вызовами.
 */

beforeEach(async () => {
  await resetData();
});

afterAll(async () => {
  await closePool();
});

describe('лимит команд', () => {
  it('создаёт команды до лимита', async () => {
    const eventId = await createEvent({ maxTeams: 10 });

    for (let i = 1; i <= 10; i += 1) {
      const result = await registerTeam(eventId, `Команда ${i}`);
      expect(result.ok, `команда ${i}`).toBe(true);
    }

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.teams WHERE event_id = $1`,
      [eventId],
    );
    expect(Number(rows[0]!.count)).toBe(10);
  });

  it('одиннадцатую команду не создаёт', async () => {
    const eventId = await createEvent({ maxTeams: 10 });

    for (let i = 1; i <= 10; i += 1) {
      await registerTeam(eventId, `Команда ${i}`);
    }

    const result = await registerTeam(eventId, 'Команда 11');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('event_full');
  });

  it('уважает лимит меньше десяти', async () => {
    const eventId = await createEvent({ maxTeams: 3 });

    for (let i = 1; i <= 3; i += 1) {
      expect((await registerTeam(eventId, `Команда ${i}`)).ok).toBe(true);
    }

    expect((await registerTeam(eventId, 'Лишняя')).error).toBe('event_full');
  });

  it('не пробивается параллельными запросами за последнее место', async () => {
    const eventId = await createEvent({ maxTeams: 5 });

    // Четыре места уже заняты — свободно ровно одно.
    for (let i = 1; i <= 4; i += 1) {
      await registerTeam(eventId, `Команда ${i}`);
    }

    // Двадцать одновременных попыток на одно место.
    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, i) => registerTeam(eventId, `Гонка ${i}`)),
    );

    const created = attempts.filter((r) => r.ok);
    const rejected = attempts.filter((r) => r.error === 'event_full');

    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(19);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.teams WHERE event_id = $1 AND status <> 'cancelled'`,
      [eventId],
    );
    expect(Number(rows[0]!.count)).toBe(5);
  });

  it('отмена команды освобождает место', async () => {
    const eventId = await createEvent({ maxTeams: 2 });

    const first = await registerTeam(eventId, 'Первая');
    await registerTeam(eventId, 'Вторая');

    expect((await registerTeam(eventId, 'Третья')).error).toBe('event_full');

    await pool.query(`UPDATE public.teams SET status = 'cancelled' WHERE id = $1`, [first.teamId]);

    expect((await registerTeam(eventId, 'Третья')).ok).toBe(true);
  });

  it('администратор обходит окно регистрации, но не лимит', async () => {
    const eventId = await createEvent({ maxTeams: 2, registrationOpen: false, status: 'live' });

    // Обычная регистрация закрыта.
    expect((await registerTeam(eventId, 'Обычная')).error).toBe('registration_closed');

    // Администратор всё равно может завести команду.
    expect((await registerTeam(eventId, 'Ручная 1', { bypassLimits: true })).ok).toBe(true);
    expect((await registerTeam(eventId, 'Ручная 2', { bypassLimits: true })).ok).toBe(true);

    // Но лимит остаётся непробиваемым.
    expect((await registerTeam(eventId, 'Ручная 3', { bypassLimits: true })).error).toBe(
      'event_full',
    );
  });
});

describe('правила регистрации', () => {
  it('не регистрирует при закрытом окне', async () => {
    const eventId = await createEvent({ registrationOpen: false });
    expect((await registerTeam(eventId, 'Команда')).error).toBe('registration_closed');
  });

  it('не регистрирует, пока событие в черновике', async () => {
    const eventId = await createEvent({ status: 'draft' });
    expect((await registerTeam(eventId, 'Команда')).error).toBe('registration_closed');
  });

  it('не допускает одинаковых названий', async () => {
    const eventId = await createEvent();

    expect((await registerTeam(eventId, 'Ночной трамвай')).ok).toBe(true);
    expect((await registerTeam(eventId, 'Ночной трамвай')).error).toBe('team_name_taken');
  });

  it('считает названия одинаковыми независимо от регистра и пробелов', async () => {
    const eventId = await createEvent();

    await registerTeam(eventId, 'Ночной Трамвай');
    expect((await registerTeam(eventId, '  ночной трамвай  ')).error).toBe('team_name_taken');
  });

  it('освобождает название после отмены команды', async () => {
    const eventId = await createEvent();

    const first = await registerTeam(eventId, 'Трамвай');
    await pool.query(`UPDATE public.teams SET status = 'cancelled' WHERE id = $1`, [first.teamId]);

    expect((await registerTeam(eventId, 'Трамвай')).ok).toBe(true);
  });

  it('создаёт капитана, согласие и сессию одной операцией', async () => {
    const eventId = await createEvent();
    const result = await registerTeam(eventId, 'Команда');

    const { rows } = await pool.query<{
      members: string;
      consents: string;
      sessions: string;
      captains: string;
    }>(
      `SELECT
         (SELECT count(*) FROM public.team_members WHERE team_id = $1) AS members,
         (SELECT count(*) FROM public.consents WHERE team_id = $1) AS consents,
         (SELECT count(*) FROM public.team_sessions WHERE team_id = $1) AS sessions,
         (SELECT count(*) FROM public.team_members WHERE team_id = $1 AND is_captain) AS captains`,
      [result.teamId],
    );

    expect(Number(rows[0]!.members)).toBe(1);
    expect(Number(rows[0]!.consents)).toBe(1);
    expect(Number(rows[0]!.sessions)).toBe(1);
    expect(Number(rows[0]!.captains)).toBe(1);
  });

  it('выдаёт код из шести символов заданного алфавита', async () => {
    const eventId = await createEvent();
    const result = await registerTeam(eventId, 'Команда');

    expect(result.joinCode).toMatch(/^[A-Z0-9]{6}$/);
  });
});

describe('лимит участников', () => {
  it('пускает участников до размера команды', async () => {
    const eventId = await createEvent({ teamSize: 4 });
    const team = await registerTeam(eventId, 'Команда');

    // Капитан уже есть, добавляем ещё троих.
    for (let i = 2; i <= 4; i += 1) {
      const result = await joinTeam(eventId, team.joinCode!, `Участник ${i}`);
      expect(result.ok, `участник ${i}`).toBe(true);
    }

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.team_members WHERE team_id = $1`,
      [team.teamId],
    );
    expect(Number(rows[0]!.count)).toBe(4);
  });

  // Состав менялся с четырёх на пять уже после запуска, и держало
  // его не приложение, а CHECK-ограничение в схеме: правка
  // team_size в админке просто падала бы с ошибкой базы. Тест
  // сторожит именно диапазон, а не текущее значение.
  it('пускает пятого участника, когда состав пять', async () => {
    const eventId = await createEvent({ teamSize: 5 });
    const team = await registerTeam(eventId, 'Пятеро');

    for (let i = 2; i <= 5; i += 1) {
      const result = await joinTeam(eventId, team.joinCode!, `Участник ${i}`);
      expect(result.ok, `участник ${i}`).toBe(true);
    }

    expect((await joinTeam(eventId, team.joinCode!, 'Шестой')).error).toBe('team_full');
  });

  it('пятого участника не пускает', async () => {
    const eventId = await createEvent({ teamSize: 4 });
    const team = await registerTeam(eventId, 'Команда');

    for (let i = 2; i <= 4; i += 1) {
      await joinTeam(eventId, team.joinCode!, `Участник ${i}`);
    }

    const result = await joinTeam(eventId, team.joinCode!, 'Пятый лишний');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('team_full');
  });

  it('не пробивается параллельными запросами на последнее место', async () => {
    const eventId = await createEvent({ teamSize: 4 });
    const team = await registerTeam(eventId, 'Команда');

    // Капитан плюс двое: свободно одно место.
    await joinTeam(eventId, team.joinCode!, 'Второй');
    await joinTeam(eventId, team.joinCode!, 'Третий');

    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, i) => joinTeam(eventId, team.joinCode!, `Гонка ${i}`)),
    );

    expect(attempts.filter((r) => r.ok)).toHaveLength(1);
    expect(attempts.filter((r) => r.error === 'team_full')).toHaveLength(9);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM public.team_members WHERE team_id = $1`,
      [team.teamId],
    );
    expect(Number(rows[0]!.count)).toBe(4);
  });

  it('повторный вход тем же именем не занимает второе место', async () => {
    const eventId = await createEvent({ teamSize: 2 });
    const team = await registerTeam(eventId, 'Команда');

    await joinTeam(eventId, team.joinCode!, 'Аня');
    // Аня потеряла сессию и входит снова.
    const again = await joinTeam(eventId, team.joinCode!, 'аня');

    expect(again.ok).toBe(true);

    const { rows } = await pool.query<{ members: string; sessions: string }>(
      `SELECT
         (SELECT count(*) FROM public.team_members WHERE team_id = $1) AS members,
         (SELECT count(*) FROM public.team_sessions WHERE team_id = $1) AS sessions`,
      [team.teamId],
    );

    // Участников по-прежнему двое, а сессий стало больше.
    expect(Number(rows[0]!.members)).toBe(2);
    expect(Number(rows[0]!.sessions)).toBe(3);
  });

  it('не пускает по неверному коду', async () => {
    const eventId = await createEvent();
    await registerTeam(eventId, 'Команда');

    expect((await joinTeam(eventId, 'ZZZZZZ', 'Чужой')).error).toBe('invalid_join_code');
  });

  it('не пускает в отменённую команду', async () => {
    const eventId = await createEvent();
    const team = await registerTeam(eventId, 'Команда');

    await pool.query(`UPDATE public.teams SET status = 'cancelled' WHERE id = $1`, [team.teamId]);

    expect((await joinTeam(eventId, team.joinCode!, 'Кто-то')).error).toBe('team_cancelled');
  });

  it('пускает по коду в нижнем регистре', async () => {
    const eventId = await createEvent();
    const team = await registerTeam(eventId, 'Команда');

    const result = await joinTeam(eventId, team.joinCode!.toLowerCase(), 'Второй');
    expect(result.ok).toBe(true);
  });
});

/**
 * Свой размер у команды.
 *
 * Живой случай: одна компания приходит вшестером, остальные
 * вчетвером. Общее число в настройках мероприятия либо не пускает
 * позванных, либо разрешает всем добрать лишних.
 */
describe('свой потолок участников', () => {
  it('команда со своим числом пускает больше общего', async () => {
    const id = await createEvent({ status: 'registration', teamSize: 4 });
    const team = await registerTeam(id, 'Шестеро', { bypassLimits: true });
    await setTeamSize(team.teamId!, 6);

    // Капитан уже внутри — добираем до шести.
    for (const name of ['Второй', 'Третий', 'Четвёртый', 'Пятый', 'Шестой']) {
      const joined = await joinTeam(id, team.joinCode!, name);
      expect(joined.ok, `${name} не вошёл`).toBe(true);
    }

    const seventh = await joinTeam(id, team.joinCode!, 'Седьмой');
    expect(seventh.ok).toBe(false);
    expect(seventh.error).toBe('team_full');
  });

  it('без своего числа действует общее', async () => {
    const id = await createEvent({ status: 'registration', teamSize: 2 });
    const team = await registerTeam(id, 'Двое', { bypassLimits: true });

    expect((await joinTeam(id, team.joinCode!, 'Второй')).ok).toBe(true);
    const third = await joinTeam(id, team.joinCode!, 'Третий');
    expect(third.ok).toBe(false);
    expect(third.error).toBe('team_full');
  });

  it('своё число может быть и меньше общего', async () => {
    const id = await createEvent({ status: 'registration', teamSize: 6 });
    const team = await registerTeam(id, 'Вдвоём', { bypassLimits: true });
    await setTeamSize(team.teamId!, 2);

    expect((await joinTeam(id, team.joinCode!, 'Второй')).ok).toBe(true);
    expect((await joinTeam(id, team.joinCode!, 'Третий')).ok).toBe(false);
  });
});

/**
 * Удаление команды.
 *
 * Отмена и удаление — разные действия. Удаление нужно до старта:
 * обкатали, попробовали, теперь список должен быть чистым перед
 * настоящими людьми.
 */
describe('удаление команды', () => {
  it('уносит участников и освобождает место', async () => {
    const id = await createEvent({ status: 'registration', maxTeams: 1 });
    const team = await registerTeam(id, 'Тестовая', { bypassLimits: true });
    await joinTeam(id, team.joinCode!, 'Второй');

    const result = await deleteTeam(team.teamId!);
    expect(result.ok).toBe(true);
    expect(result.members).toBe(2);

    // Место освободилось: следующая команда влезает в лимит.
    const next = await registerTeam(id, 'Настоящая');
    expect(next.ok).toBe(true);
  });

  it('возвращает захваченные задания в общий пул', async () => {
    const id = await createEvent({ status: 'live', startsIn: '-1 hour' });
    const team = await registerTeam(id, 'Захватчики', { bypassLimits: true });
    const task = await createTask(id, { number: 1, points: 50 });

    const slot = await createSlot(team.teamId!, task);
    await confirmSubmission(slot.submissionId!);
    await acceptSubmission(slot.submissionId!);
    expect((await taskClaim(task)).teamId).toBe(team.teamId);

    // До старта вернуть нельзя — сначала статус, потом удаление.
    await pool.query(`UPDATE public.events SET status = 'registration' WHERE id = $1`, [id]);

    const result = await deleteTeam(team.teamId!);
    expect(result.ok).toBe(true);
    expect(result.releasedTasks).toBe(1);

    // Задание снова свободно: иначе оно ушло бы из игры вместе с
    // удалённой командой, и никто бы его больше не увидел.
    expect((await taskClaim(task)).teamId).toBeNull();
    expect((await taskClaim(task)).submissionId).toBeNull();
  });

  it('после старта удалить нельзя — только отменить', async () => {
    const id = await createEvent({ status: 'live', startsIn: '-1 hour' });
    const team = await registerTeam(id, 'Играющие', { bypassLimits: true });

    const result = await deleteTeam(team.teamId!);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('event_started');

    // И команда на месте.
    const { rows } = await pool.query(`SELECT id FROM public.teams WHERE id = $1`, [team.teamId]);
    expect(rows).toHaveLength(1);
  });

  it('несуществующую команду удалить нельзя', async () => {
    const result = await deleteTeam('00000000-0000-4000-8000-000000000000');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('team_not_found');
  });
});
