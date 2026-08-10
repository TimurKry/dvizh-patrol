#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────
 * QA-фасад REST поверх локального Postgres.
 *
 * ЭТО НЕ ЧАСТЬ ПРИЛОЖЕНИЯ. Скрипт нужен ровно для одного:
 * посмотреть страницы глазами, когда настоящий Supabase
 * недоступен — нет проекта, нет ключей или сеть закрыта
 * политикой. В продакшене и в CI он не участвует.
 *
 * Реализовано ровно то подмножество PostgREST, которым
 * пользуется приложение: выборка с фильтрами и сортировкой,
 * точный счётчик, одноуровневые вложенные выборки, insert /
 * update / delete и вызов функций через /rpc.
 *
 * Проверка подписи JWT намеренно отсутствует: ключ трактуется
 * как имя роли. Сервер слушает только 127.0.0.1 и живёт минуту
 * ради скриншота, поэтому городить подпись здесь не для кого.
 *
 * Запуск:
 *   npm run db:start && npm run db:reset
 *   node scripts/qa-rest.mjs            # http://127.0.0.1:54321
 * ─────────────────────────────────────────────────────────────
 */

import { createServer } from 'node:http';
import pg from 'pg';

const PORT = Number(process.env.QA_REST_PORT ?? 54321);
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://dvizh:dvizh_local_password@127.0.0.1:54329/dvizh_patrol';

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });

/** Операторы PostgREST → SQL. Список закрытый: чего нет, то не поддержано. */
const OPERATORS = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
};

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

const ident = (name) => `"${String(name).replace(/"/g, '')}"`;

/**
 * Разбор `select=`.
 *
 * Поддерживаются три формы: `*`, простой список колонок и
 * одноуровневое вложение `alias:fk (cols)` / `table!inner(cols)`.
 * Вложение превращается в скалярный подзапрос с json_agg —
 * этого хватает обоим местам, где приложение им пользуется.
 */
function parseSelect(raw, table) {
  if (!raw || raw === '*') return { columns: '*', embeds: [] };

  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of raw) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);

  const columns = [];
  const embeds = [];

  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const embed = part.match(/^([a-z_]+)(?::([a-z_]+))?(!inner)?\s*\(([^)]*)\)$/i);
    if (embed) {
      const [, name, fkColumn, inner, inside] = embed;
      embeds.push({
        alias: name,
        // `tasks:task_id (*)` — связь по колонке task_id текущей
        // таблицы; `teams!inner(...)` — по <table>_id в ней же.
        localColumn: fkColumn ?? `${name.replace(/s$/, '')}_id`,
        target: fkColumn ? name : name,
        columns: inside.trim(),
        inner: Boolean(inner),
      });
      continue;
    }
    if (part === '*') {
      columns.push(`${ident(table)}.*`);
      continue;
    }
    columns.push(`${ident(table)}.${ident(part)}`);
  }

  return { columns: columns.length ? columns.join(', ') : '*', embeds };
}

function buildWhere(params, table, values) {
  const clauses = [];

  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;

    // Фильтр по вложенной таблице (`teams.event_id=eq.…`) в этом
    // фасаде не поддержан: приложение использует его только для
    // подсчёта участников, а там достаточно фильтра по родителю.
    const column = key.includes('.') ? key.split('.').pop() : key;

    const match = String(raw).match(/^([a-z]+)\.(.*)$/is);
    if (!match) continue;
    const [, op, value] = match;

    if (op === 'is') {
      clauses.push(`${ident(table)}.${ident(column)} IS ${value === 'null' ? 'NULL' : value}`);
      continue;
    }

    if (op === 'in') {
      const list = value
        .replace(/^\(|\)$/g, '')
        .split(',')
        .filter(Boolean);
      if (list.length === 0) {
        clauses.push('false');
        continue;
      }
      const placeholders = list.map((item) => {
        values.push(item.replace(/^"|"$/g, ''));
        return `$${values.length}`;
      });
      clauses.push(`${ident(table)}.${ident(column)} IN (${placeholders.join(', ')})`);
      continue;
    }

    const sqlOp = OPERATORS[op];
    if (!sqlOp) continue;
    values.push(value);
    clauses.push(`${ident(table)}.${ident(column)} ${sqlOp} $${values.length}`);
  }

  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function buildOrder(raw, table) {
  if (!raw) return '';
  const parts = raw.split(',').map((item) => {
    const [column, ...flags] = item.split('.');
    const desc = flags.includes('desc');
    const nulls = flags.includes('nullslast') ? ' NULLS LAST' : '';
    return `${ident(table)}.${ident(column)} ${desc ? 'DESC' : 'ASC'}${nulls}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
}

/**
 * Роль вытаскивается из ключа по вхождению имени.
 *
 * `lib/env.ts` требует ключи не короче двадцати символов, поэтому
 * в `.env.local` они выглядят как `service_role-local-qa-key`, а
 * не как голое имя роли. Сравнение по вхождению снимает это
 * ограничение, не заводя подписанных JWT ради скриншота.
 */
function roleFromRequest(req) {
  const header = req.headers.authorization ?? '';
  const key = header.replace(/^Bearer\s+/i, '') || String(req.headers.apikey ?? '');
  if (key.includes('service_role')) return 'service_role';
  if (key.includes('authenticated')) return 'authenticated';
  return 'anon';
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function send(res, status, payload, extraHeaders = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': 'content-range',
    ...extraHeaders,
  });
  res.end(body);
}

async function withRole(role, run) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${ident(role)}`);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role }),
    ]);
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function embedSql(embed, table) {
  const target = ident(embed.target);
  const inner = embed.columns === '*' ? `${target}.*` : embed.columns;
  return `(
    SELECT COALESCE(json_agg(row_to_json(sub)), '[]'::json)
    FROM (SELECT ${inner} FROM ${target}
          WHERE ${target}."id" = ${ident(table)}.${ident(embed.localColumn)}) sub
  ) AS ${ident(embed.alias)}`;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, undefined);

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/^\/rest\/v1/, '');
  const role = roleFromRequest(req);
  const prefer = String(req.headers.prefer ?? '');
  const wantsSingle = String(req.headers.accept ?? '').includes('pgrst.object');

  try {
    // ═══ Вызов функции ══════════════════════════════════════
    if (path.startsWith('/rpc/')) {
      const fn = path.slice(5);
      const args = (await readBody(req)) ?? {};
      const names = Object.keys(args);
      const placeholders = names.map((name, index) => `${ident(name)} => $${index + 1}`);
      const rows = await withRole(role, (client) =>
        client
          .query(
            `SELECT public.${ident(fn)}(${placeholders.join(', ')}) AS result`,
            names.map((name) => args[name]),
          )
          .then((r) => r.rows),
      );
      return send(res, 200, rows[0]?.result ?? null);
    }

    const table = path.replace(/^\//, '');
    if (!table) return send(res, 404, { message: 'not found' });

    // ═══ Чтение ═════════════════════════════════════════════
    if (req.method === 'GET' || req.method === 'HEAD') {
      const params = [...url.searchParams.entries()];
      const { columns, embeds } = parseSelect(url.searchParams.get('select'), table);
      const values = [];
      const where = buildWhere(params, table, values);
      const order = buildOrder(url.searchParams.get('order'), table);
      const limit = url.searchParams.get('limit');

      const projection = [columns, ...embeds.map((embed) => embedSql(embed, table))].join(', ');
      const sql =
        `SELECT ${projection} FROM public.${ident(table)} ${where} ${order}` +
        (limit ? ` LIMIT ${Number(limit)}` : '');

      const { rows, count } = await withRole(role, async (client) => {
        const needCount = prefer.includes('count=exact');
        const total = needCount
          ? Number(
              (
                await client.query(
                  `SELECT count(*)::int AS c FROM public.${ident(table)} ${where}`,
                  values,
                )
              ).rows[0].c,
            )
          : null;
        // HEAD-запрос supabase-js шлёт ради одного счётчика.
        if (req.method === 'HEAD') return { rows: [], count: total };
        return { rows: (await client.query(sql, values)).rows, count: total };
      });

      const headers =
        count === null ? {} : { 'content-range': `0-${Math.max(0, rows.length - 1)}/${count}` };

      if (req.method === 'HEAD') {
        res.writeHead(200, { 'access-control-expose-headers': 'content-range', ...headers });
        return res.end();
      }
      if (wantsSingle) return send(res, 200, rows[0] ?? null, headers);
      return send(res, 200, rows, headers);
    }

    // ═══ Запись ═════════════════════════════════════════════
    const body = await readBody(req);

    if (req.method === 'POST') {
      const records = Array.isArray(body) ? body : [body];
      const names = Object.keys(records[0] ?? {});
      const values = [];
      const tuples = records.map(
        (record) =>
          `(${names
            .map((name) => {
              values.push(record[name]);
              return `$${values.length}`;
            })
            .join(', ')})`,
      );
      const rows = await withRole(role, (client) =>
        client
          .query(
            `INSERT INTO public.${ident(table)} (${names.map(ident).join(', ')})
             VALUES ${tuples.join(', ')} RETURNING *`,
            values,
          )
          .then((r) => r.rows),
      );
      return send(res, 201, wantsSingle ? (rows[0] ?? null) : rows);
    }

    if (req.method === 'PATCH') {
      const names = Object.keys(body ?? {});
      const values = names.map((name) => body[name]);
      const assignments = names.map((name, index) => `${ident(name)} = $${index + 1}`);
      const where = buildWhere([...url.searchParams.entries()], table, values);
      const rows = await withRole(role, (client) =>
        client
          .query(
            `UPDATE public.${ident(table)} SET ${assignments.join(', ')} ${where} RETURNING *`,
            values,
          )
          .then((r) => r.rows),
      );
      return send(res, 200, wantsSingle ? (rows[0] ?? null) : rows);
    }

    if (req.method === 'DELETE') {
      const values = [];
      const where = buildWhere([...url.searchParams.entries()], table, values);
      const rows = await withRole(role, (client) =>
        client
          .query(`DELETE FROM public.${ident(table)} ${where} RETURNING *`, values)
          .then((r) => r.rows),
      );
      return send(res, 200, rows);
    }

    return send(res, 405, { message: 'method not allowed' });
  } catch (error) {
    return send(res, 400, { message: error.message, code: error.code ?? null });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`QA REST на http://127.0.0.1:${PORT} → ${DATABASE_URL}`);
});
