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
import fs from 'node:fs/promises';
import path from 'node:path';
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
 * Рекурсивный: `teams:team_id ( *, events:event_id ( * ) )` —
 * ровно тот запрос, которым читается сессия команды, и без
 * второго уровня вложенности он не собирается.
 *
 * Вложение превращается в скалярный подзапрос: связь всегда идёт
 * по внешнему ключу текущей таблицы на `id` целевой, а других
 * форм приложение не использует.
 */
function splitTopLevel(raw) {
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
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseEmbed(part) {
  const open = part.indexOf('(');
  if (open === -1 || !part.endsWith(')')) return null;

  const head = part.slice(0, open).trim();
  const inside = part.slice(open + 1, -1);

  const match = head.match(/^([a-z_]+)(?::([a-z_]+))?(!inner|!left)?$/i);
  if (!match) return null;
  const [, name, fkColumn, modifier] = match;

  return {
    alias: name,
    // `tasks:task_id (*)` — связь по названной колонке;
    // `teams!inner(...)` — по <единственное_число>_id.
    localColumn: fkColumn ?? `${name.replace(/s$/, '')}_id`,
    target: name,
    inner: modifier === '!inner',
    select: inside.trim(),
  };
}

/** Проекция таблицы: колонки плюс подзапросы вложений. */
function projection(raw, table) {
  if (!raw || raw === '*') return `${ident(table)}.*`;

  const pieces = [];

  for (const part of splitTopLevel(raw)) {
    const embed = parseEmbed(part);
    if (embed) {
      pieces.push(embedSql(embed, table));
      continue;
    }
    pieces.push(part === '*' ? `${ident(table)}.*` : `${ident(table)}.${ident(part)}`);
  }

  return pieces.length ? pieces.join(', ') : `${ident(table)}.*`;
}

/**
 * Вложение как скалярный подзапрос.
 *
 * Отдаётся объектом, а не массивом: supabase-js приводит связь
 * «многие к одному» к объекту, и приложение рассчитывает именно
 * на это (`normalizeRelation` принимает оба вида, но объект —
 * то, что вернул бы настоящий PostgREST).
 */
function embedSql(embed, table) {
  const target = ident(embed.target);
  const inner = projection(embed.select, embed.target);
  return `(
    SELECT row_to_json(sub) FROM (
      SELECT ${inner} FROM public.${target}
      WHERE ${target}."id" = ${ident(table)}.${ident(embed.localColumn)}
      LIMIT 1
    ) sub
  ) AS ${ident(embed.alias)}`;
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
    // Без явного списка методов Chrome заворачивает preflight для
    // PUT, и загрузка файла падает ещё до запроса.
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
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

/**
 * Минимальный GoTrue для админки.
 *
 * Админка живёт за Supabase Auth, и без неё половину чек-листа
 * нельзя посмотреть глазами. Здесь реализованы ровно два вызова,
 * которыми пользуется приложение: вход по паролю и чтение
 * текущего пользователя.
 *
 * Пароль не проверяется вообще, а «токен» — это id строки из
 * `admin_users`. Ровно поэтому фасад слушает только 127.0.0.1 и
 * никогда не попадает в сборку: это стенд для скриншотов, а не
 * замена аутентификации.
 */
async function handleAuth(req, res, url) {
  const now = Math.floor(Date.now() / 1000);

  const userByEmail = async (email) => {
    const { rows } = await pool.query(
      `SELECT user_id, email FROM public.admin_users WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0] ?? null;
  };

  if (url.pathname.endsWith('/token')) {
    const body = (await readBody(req)) ?? {};
    const admin = await userByEmail(body.email ?? '');
    if (!admin) return send(res, 400, { error: 'invalid_grant', error_description: 'no such user' });

    return send(res, 200, {
      access_token: admin.user_id,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: admin.user_id,
      user: { id: admin.user_id, email: admin.email, aud: 'authenticated', role: 'authenticated' },
    });
  }

  if (url.pathname.endsWith('/user')) {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const { rows } = await pool.query(
      `SELECT user_id, email FROM public.admin_users WHERE user_id::text = $1`,
      [token],
    );
    if (!rows[0]) return send(res, 401, { message: 'invalid token' });
    return send(res, 200, {
      id: rows[0].user_id,
      email: rows[0].email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    });
  }

  if (url.pathname.endsWith('/logout')) return send(res, 204, undefined);

  return send(res, 404, { message: 'not implemented in qa facade' });
}


// ═══ Storage ═══════════════════════════════════════════════════

/**
 * Файловое хранилище на диске.
 *
 * Реализовано подмножество Storage API, которым пользуется
 * `lib/storage/index.ts`: подписанная ссылка на загрузку, запись
 * по ней, чтение, список и удаление. Подписи не проверяются —
 * «токен» здесь просто часть URL.
 *
 * Без этого куска нельзя проверить главный сценарий продукта:
 * команда отправляет фотографию, организатор её принимает, баллы
 * попадают в рейтинг. Всё остальное в стенде существует ради него.
 */
const STORAGE_ROOT = process.env.QA_STORAGE_DIR ?? '/tmp/dvizh-qa-storage';

const objectPath = (bucket, key) =>
  path.join(STORAGE_ROOT, bucket, ...key.split('/').filter((part) => part && part !== '..'));

/**
 * Тело запроса на запись объекта.
 *
 * supabase-js в браузере заворачивает Blob в multipart/form-data,
 * а в Node шлёт сырые байты. Записать на диск нужно сам файл, а
 * не конверт, иначе sharp потом не прочитает превью.
 */
async function readObjectBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);

  const type = String(req.headers['content-type'] ?? '');
  const boundary = type.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!type.startsWith('multipart/form-data') || !boundary) return raw;

  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  let cursor = raw.indexOf(marker);

  while (cursor !== -1) {
    const headerEnd = raw.indexOf('\r\n\r\n', cursor);
    if (headerEnd === -1) break;

    const headers = raw.subarray(cursor, headerEnd).toString('utf8');
    const next = raw.indexOf(marker, headerEnd);
    const end = next === -1 ? raw.length : next - 2; // без CRLF перед границей

    // Файл — единственная часть с filename; остальные поля
    // (cacheControl и прочее) нас не интересуют.
    if (/filename=/i.test(headers)) return raw.subarray(headerEnd + 4, end);

    cursor = next;
  }

  return raw;
}

async function handleStorage(req, res, url) {
  // /storage/v1/<...>
  const parts = url.pathname.replace(/^\/storage\/v1\//, '').split('/');
  const [kind] = parts;

  if (kind !== 'object') return send(res, 404, { message: 'not implemented in qa facade' });

  const rest = parts.slice(1);

  // POST /object/upload/sign/{bucket}/{path...}
  if (rest[0] === 'upload' && rest[1] === 'sign' && req.method === 'POST') {
    const bucket = rest[2];
    const key = rest.slice(3).join('/');
    return send(res, 200, { url: `/object/upload/sign/${bucket}/${key}?token=qa` });
  }

  // PUT /object/upload/sign/{bucket}/{path...}
  if (rest[0] === 'upload' && rest[1] === 'sign' && req.method === 'PUT') {
    const bucket = rest[2];
    const key = rest.slice(3).join('/');
    const target = objectPath(bucket, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await readObjectBody(req));
    return send(res, 200, { Key: `${bucket}/${key}` });
  }

  // POST /object/sign/{bucket}            — пакет ссылок
  // POST /object/sign/{bucket}/{path...}  — одна ссылка
  if (rest[0] === 'sign' && req.method === 'POST') {
    const bucket = rest[1];
    const key = rest.slice(2).join('/');
    const body = (await readBody(req)) ?? {};

    if (!key) {
      const paths = Array.isArray(body.paths) ? body.paths : [];
      return send(
        res,
        200,
        paths.map((item) => ({
          path: item,
          signedURL: `/object/sign/${bucket}/${item}?token=qa`,
          error: null,
        })),
      );
    }

    return send(res, 200, { signedURL: `/object/sign/${bucket}/${key}?token=qa` });
  }

  // Чтение объекта. supabase-js в зависимости от версии зовёт
  // /object/{bucket}/{path}, /object/authenticated/... или
  // /object/public/... — поддерживаем все три, потому что
  // именно на этом месте загрузка и спотыкалась.
  if (req.method === 'GET') {
    const prefixed = rest[0] === 'sign' || rest[0] === 'authenticated' || rest[0] === 'public';
    const bucket = prefixed ? rest[1] : rest[0];
    const key = rest.slice(prefixed ? 2 : 1).join('/');
    try {
      const body = await fs.readFile(objectPath(bucket, key));
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'access-control-allow-origin': '*',
      });
      return res.end(body);
    } catch {
      return send(res, 404, { message: 'Object not found' });
    }
  }

  // POST /object/list/{bucket}
  if (rest[0] === 'list' && req.method === 'POST') {
    const bucket = rest[1];
    const body = (await readBody(req)) ?? {};
    const prefix = String(body.prefix ?? '');
    const search = String(body.search ?? '');
    try {
      const dir = objectPath(bucket, prefix);
      const names = await fs.readdir(dir);
      const matched = names.filter((name) => !search || name.includes(search));
      return send(
        res,
        200,
        matched.map((name) => ({ name, id: name, metadata: {} })),
      );
    } catch {
      return send(res, 200, []);
    }
  }

  // DELETE /object/{bucket} с телом { prefixes }
  if (req.method === 'DELETE') {
    const bucket = rest[0];
    const body = (await readBody(req)) ?? {};
    const prefixes = Array.isArray(body.prefixes) ? body.prefixes : [];
    for (const key of prefixes) {
      await fs.rm(objectPath(bucket, key), { force: true });
    }
    return send(res, 200, prefixes.map((key) => ({ name: key })));
  }

  // POST /object/{bucket}/{path...} — прямая загрузка
  if (req.method === 'POST') {
    const bucket = rest[0];
    const key = rest.slice(1).join('/');
    const target = objectPath(bucket, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await readObjectBody(req));
    return send(res, 200, { Key: `${bucket}/${key}` });
  }

  return send(res, 404, { message: 'not implemented in qa facade' });
}

const VERBOSE = process.env.QA_REST_LOG === '1';

const server = createServer(async (req, res) => {
  if (VERBOSE) console.log(req.method, req.url);
  if (req.method === 'OPTIONS') return send(res, 204, undefined);

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith('/storage/v1/')) {
    try {
      return await handleStorage(req, res, url);
    } catch (error) {
      return send(res, 400, { message: error.message });
    }
  }

  if (url.pathname.startsWith('/auth/v1/')) {
    try {
      return await handleAuth(req, res, url);
    } catch (error) {
      return send(res, 400, { message: error.message });
    }
  }

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
      const values = [];
      const where = buildWhere(params, table, values);
      const order = buildOrder(url.searchParams.get('order'), table);
      const limit = url.searchParams.get('limit');

      const sql =
        `SELECT ${projection(url.searchParams.get('select'), table)} ` +
        `FROM public.${ident(table)} ${where} ${order}` +
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
