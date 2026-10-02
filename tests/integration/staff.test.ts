import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, pool, resetData } from '../helpers/db';

/**
 * Сотрудники и роли.
 *
 * Главный риск здесь не в том, что кто-то увидит лишнее, а в том,
 * что студия останется без владельца: отключить или понизить
 * последнего — и вернуть права можно будет только руками в базе.
 */

async function createStaff(role: 'owner' | 'manager' | 'host'): Promise<string> {
  const id = randomUUID();
  await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${id}@example.com`]);
  await pool.query(`INSERT INTO public.admin_users (user_id, email, role) VALUES ($1, $2, $3)`, [
    id,
    `${id}@example.com`,
    role,
  ]);
  return id;
}

async function isAdminAs(userId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: 'authenticated', sub: userId }),
    ]);
    await client.query('SET LOCAL ROLE authenticated');
    const { rows } = await client.query<{ is_admin: boolean }>('SELECT public.is_admin()');
    await client.query('ROLLBACK');
    return rows[0]!.is_admin;
  } finally {
    client.release();
  }
}

beforeEach(async () => {
  await resetData();
  await pool.query('DELETE FROM public.admin_users');
});

afterAll(async () => {
  await pool.query('DELETE FROM public.admin_users');
  await closePool();
});

describe('последний владелец', () => {
  it('не может быть понижен', async () => {
    const owner = await createStaff('owner');
    await expect(
      pool.query(`UPDATE public.admin_users SET role = 'manager' WHERE user_id = $1`, [owner]),
    ).rejects.toThrow(/last_owner/);
  });

  it('не может быть отключён', async () => {
    const owner = await createStaff('owner');
    await expect(
      pool.query(`UPDATE public.admin_users SET disabled_at = now() WHERE user_id = $1`, [owner]),
    ).rejects.toThrow(/last_owner/);
  });

  it('при втором владельце — может', async () => {
    const first = await createStaff('owner');
    await createStaff('owner');
    await pool.query(`UPDATE public.admin_users SET role = 'manager' WHERE user_id = $1`, [first]);
    const { rows } = await pool.query<{ role: string }>(
      `SELECT role FROM public.admin_users WHERE user_id = $1`,
      [first],
    );
    expect(rows[0]!.role).toBe('manager');
  });
});

describe('is_admin', () => {
  it('ведущий — администратор игры', async () => {
    await createStaff('owner');
    const host = await createStaff('host');
    expect(await isAdminAs(host)).toBe(true);
  });

  it('отключённый сотрудник — уже нет', async () => {
    await createStaff('owner');
    const manager = await createStaff('manager');
    await pool.query(`UPDATE public.admin_users SET disabled_at = now() WHERE user_id = $1`, [
      manager,
    ]);
    expect(await isAdminAs(manager)).toBe(false);
  });
});
