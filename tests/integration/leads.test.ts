import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, pool, resetData } from '../helpers/db';

/**
 * Права на заявки.
 *
 * Лендинг пишет в эту таблицу публичным ключом, то есть ключ
 * фактически лежит в открытом доступе. Всё, что ему разрешено
 * сверх «оставить новую заявку», — дыра: чужие контакты, подмена
 * статуса, назначение ответственного.
 */

const SITE_LEAD = `
  INSERT INTO public.leads (name, email, city, scenario, participants_range, ticket_price_range)
  VALUES ('Анна', 'anna@example.com', 'Köln', 'dvizh-patrol', '30-50', '10-20')
`;

/** Выполнить запрос от имени роли PostgREST в отдельной транзакции. */
async function asRole<T>(
  role: 'anon' | 'authenticated',
  sql: string,
  claims: Record<string, string> = {},
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role, ...claims }),
    ]);
    await client.query(`SET LOCAL ROLE ${role}`);
    const { rows } = await client.query(sql);
    await client.query('COMMIT');
    return rows as T[];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createAdmin(): Promise<string> {
  const id = randomUUID();
  await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${id}@example.com`]);
  await pool.query(`INSERT INTO public.admin_users (user_id, email) VALUES ($1, $2)`, [
    id,
    `${id}@example.com`,
  ]);
  return id;
}

beforeEach(async () => {
  await resetData();
});

afterAll(async () => {
  await closePool();
});

describe('сайт (anon)', () => {
  it('оставляет новую заявку', async () => {
    await asRole('anon', SITE_LEAD);
    const { rows } = await pool.query<{ status: string; source: string }>(
      `SELECT status, source FROM public.leads`,
    );
    expect(rows).toEqual([{ status: 'new', source: 'site' }]);
  });

  it('не может задать статус, источник или ответственного', async () => {
    const admin = await createAdmin();
    const attempts = [
      `INSERT INTO public.leads (name, email, status) VALUES ('x', 'x@x.x', 'won')`,
      `INSERT INTO public.leads (name, email, source) VALUES ('x', 'x@x.x', 'manual')`,
      `INSERT INTO public.leads (name, email, assignee_id) VALUES ('x', 'x@x.x', '${admin}')`,
    ];
    for (const sql of attempts) {
      await expect(asRole('anon', sql), sql).rejects.toThrow(/row-level security/);
    }
  });

  it('не читает, не меняет и не удаляет заявки', async () => {
    await pool.query(SITE_LEAD);
    await expect(asRole('anon', `SELECT * FROM public.leads`)).rejects.toThrow(
      /permission denied for table/,
    );
    await expect(asRole('anon', `UPDATE public.leads SET status = 'won'`)).rejects.toThrow(
      /permission denied for table/,
    );
    await expect(asRole('anon', `DELETE FROM public.leads`)).rejects.toThrow(
      /permission denied for table/,
    );
    await expect(asRole('anon', `SELECT * FROM public.lead_activities`)).rejects.toThrow(
      /permission denied for table/,
    );
  });

  it('требует хотя бы один способ связи', async () => {
    await expect(
      asRole('anon', `INSERT INTO public.leads (name, city) VALUES ('Без контактов', 'Bonn')`),
    ).rejects.toThrow(/leads_contact_present/);
  });
});

describe('вошедший пользователь', () => {
  it('без строки в admin_users заявок не видит', async () => {
    await pool.query(SITE_LEAD);
    const rows = await asRole('authenticated', `SELECT * FROM public.leads`, {
      sub: randomUUID(),
    });
    expect(rows).toHaveLength(0);
  });

  it('администратор видит заявки', async () => {
    await pool.query(SITE_LEAD);
    const admin = await createAdmin();
    const rows = await asRole('authenticated', `SELECT * FROM public.leads`, { sub: admin });
    expect(rows).toHaveLength(1);
  });
});

describe('лента заявки', () => {
  it('заметка не может быть пустой', async () => {
    const { rows } = await pool.query<{ id: string }>(`${SITE_LEAD} RETURNING id`);
    await expect(
      pool.query(
        `INSERT INTO public.lead_activities (lead_id, kind, body) VALUES ($1, 'note', '  ')`,
        [rows[0]!.id],
      ),
    ).rejects.toThrow(/lead_activities_note_has_body/);
  });
});
