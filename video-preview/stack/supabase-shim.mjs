/**
 * Локальный аналог Supabase для записи ролика.
 *
 * Почему он существует. Сеть песочницы, в которой собирается
 * видео, пускает наружу только реестры пакетов и Google Fonts:
 * ни `*.supabase.co`, ни реестры контейнеров недоступны, поэтому
 * ни боевой проект, ни `supabase start` здесь не поднимаются.
 * Приложение при этом менять нельзя — оно должно записываться
 * ровно таким, каким поедет в прод.
 *
 * Отсюда решение: снаружи оставляем тот же контракт, что у
 * Supabase, а внутри — настоящий PostgreSQL с настоящими
 * миграциями проекта и настоящим PostgREST поверх них. Своего
 * кода здесь ровно два куска, которых нет в виде бинарника:
 * выдача токена администратора (GoTrue) и файловое хранилище
 * (Storage). Всё остальное — прокси.
 *
 *   /rest/v1/*     → PostgREST (настоящие таблицы, RLS, RPC)
 *   /auth/v1/*     → минимальный GoTrue: пароль → JWT
 *   /storage/v1/*  → объекты на диске + подписанные ссылки
 *
 * Приложение об этом ничего не знает: для него это обычный
 * Supabase по адресу из NEXT_PUBLIC_SUPABASE_URL.
 */

import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { JWT_SECRET, sign, verify } from './jwt.mjs';

const PORT = Number(process.env.SHIM_PORT ?? 54321);
const PGRST = process.env.PGRST_URL ?? 'http://127.0.0.1:54322';
const ROOT = process.env.STORAGE_ROOT ?? path.resolve('video-preview/scratch/storage');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo-admin@dvizh-patrol.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'demo-admin-password';
const ADMIN_ID = process.env.ADMIN_ID ?? '00000000-0000-4000-8000-000000000001';

const HOUR = 3600;

// ═══ Вспомогательное ═══════════════════════════════════════════

function json(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    ...extra,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Разбор multipart/form-data.
 *
 * Браузерная загрузка по подписанной ссылке отправляет Blob
 * формой, и без разбора тела файл до диска не доедет. Нужен один
 * кусок — сам файл, поэтому парсер намеренно минимальный.
 */
function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  if (!match) return null;
  const boundary = Buffer.from(`--${match[1] ?? match[2]}`);

  const parts = [];
  let index = buffer.indexOf(boundary);
  while (index !== -1) {
    const start = index + boundary.length;
    if (buffer.slice(start, start + 2).toString() === '--') break;
    const next = buffer.indexOf(boundary, start);
    if (next === -1) break;
    const chunk = buffer.slice(start + 2, next - 2);
    const split = chunk.indexOf('\r\n\r\n');
    if (split !== -1) {
      const headers = chunk.slice(0, split).toString('utf8');
      parts.push({ headers, body: chunk.slice(split + 4) });
    }
    index = next;
  }

  // Файл — та часть, у которой есть filename либо пустое имя поля:
  // именно так его кладёт @supabase/storage-js.
  const file =
    parts.find((p) => /filename=/i.test(p.headers)) ??
    parts.find((p) => /name="";?/i.test(p.headers)) ??
    parts[parts.length - 1];

  if (!file) return null;
  const type = /content-type:\s*([^\r\n]+)/i.exec(file.headers);
  return { body: file.body, contentType: type ? type[1].trim() : 'application/octet-stream' };
}

const objectFile = (bucket, key) => path.join(ROOT, bucket, key);
const metaFile = (bucket, key) => `${path.join(ROOT, bucket, key)}.meta.json`;

async function putObject(bucket, key, body, contentType) {
  const file = objectFile(bucket, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  await writeFile(
    metaFile(bucket, key),
    JSON.stringify({ contentType, size: body.length, updatedAt: new Date().toISOString() }),
  );
}

async function objectContentType(bucket, key) {
  try {
    const meta = JSON.parse(await readFile(metaFile(bucket, key), 'utf8'));
    return meta.contentType ?? 'application/octet-stream';
  } catch {
    return 'application/octet-stream';
  }
}

async function listObjects(bucket, prefix) {
  const dir = path.join(ROOT, bucket, prefix);
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  const out = [];
  for (const name of names) {
    if (name.endsWith('.meta.json')) continue;
    const info = await stat(path.join(dir, name));
    out.push({
      name,
      id: createHash('sha256').update(`${bucket}/${prefix}/${name}`).digest('hex'),
      updated_at: info.mtime.toISOString(),
      created_at: info.birthtime.toISOString(),
      last_accessed_at: info.atime.toISOString(),
      metadata: { size: info.size },
    });
  }
  return out;
}

// ═══ Storage ═══════════════════════════════════════════════════

/** Путь вида `bucket/ключ/через/слэши`. */
function splitBucket(rest) {
  const slash = rest.indexOf('/');
  if (slash === -1) return { bucket: rest, key: '' };
  return { bucket: rest.slice(0, slash), key: decodeURIComponent(rest.slice(slash + 1)) };
}

async function handleStorage(req, res, url) {
  const route = url.pathname.replace('/storage/v1/', '');
  const method = req.method ?? 'GET';

  // ─── Подписанная ссылка на загрузку ──────────────────────
  if (route.startsWith('object/upload/sign/')) {
    const { bucket, key } = splitBucket(route.replace('object/upload/sign/', ''));

    if (method === 'POST') {
      const token = sign({
        url: `${bucket}/${key}`,
        owner: 'service_role',
        exp: Math.floor(Date.now() / 1000) + 2 * HOUR,
      });
      return json(res, 200, {
        url: `/object/upload/sign/${bucket}/${encodeURI(key)}?token=${token}`,
      });
    }

    if (method === 'PUT') {
      const claims = verify(url.searchParams.get('token') ?? '');
      if (!claims || claims.url !== `${bucket}/${key}`) {
        return json(res, 400, { error: 'InvalidJWT', message: 'token mismatch' });
      }
      const raw = await readBody(req);
      const type = req.headers['content-type'] ?? '';
      const part = type.startsWith('multipart/form-data') ? parseMultipart(raw, type) : null;
      await putObject(bucket, key, part ? part.body : raw, part ? part.contentType : type);
      return json(res, 200, { Key: `${bucket}/${key}` });
    }
  }

  // ─── Подписанные ссылки на чтение ────────────────────────
  if (route.startsWith('object/sign/')) {
    const rest = route.replace('object/sign/', '');
    const { bucket, key } = splitBucket(rest);

    // Пакетная выдача: в пути только бакет, пути — в теле.
    if (method === 'POST' && key === '') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const expiresIn = Number(body.expiresIn ?? HOUR);
      const result = (body.paths ?? []).map((p) => {
        const token = sign({
          url: `${bucket}/${p}`,
          exp: Math.floor(Date.now() / 1000) + expiresIn,
        });
        return {
          error: null,
          path: p,
          signedURL: `/object/sign/${bucket}/${encodeURI(p)}?token=${token}`,
        };
      });
      return json(res, 200, result);
    }

    if (method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const expiresIn = Number(body.expiresIn ?? HOUR);
      const token = sign({
        url: `${bucket}/${key}`,
        exp: Math.floor(Date.now() / 1000) + expiresIn,
      });
      return json(res, 200, {
        signedURL: `/object/sign/${bucket}/${encodeURI(key)}?token=${token}`,
      });
    }

    if (method === 'GET') {
      const claims = verify(url.searchParams.get('token') ?? '');
      if (!claims || claims.url !== `${bucket}/${key}`) {
        return json(res, 400, { error: 'InvalidJWT', message: 'token mismatch' });
      }
      const file = objectFile(bucket, key);
      if (!existsSync(file)) return json(res, 404, { error: 'NotFound' });
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': await objectContentType(bucket, key),
        'content-length': body.length,
        'cache-control': 'max-age=3600',
        'access-control-allow-origin': '*',
      });
      return res.end(body);
    }
  }

  // ─── Список ──────────────────────────────────────────────
  if (route.startsWith('object/list/') && method === 'POST') {
    const bucket = route.replace('object/list/', '');
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    let items = await listObjects(bucket, body.prefix ?? '');
    if (body.search) items = items.filter((i) => i.name.includes(body.search));
    return json(res, 200, items);
  }

  // ─── Объект напрямую ─────────────────────────────────────
  if (route.startsWith('object/')) {
    const rest = route.replace('object/', '');
    const { bucket, key } = splitBucket(rest);

    if (method === 'POST' || method === 'PUT') {
      const raw = await readBody(req);
      const type = req.headers['content-type'] ?? 'application/octet-stream';
      const part = type.startsWith('multipart/form-data') ? parseMultipart(raw, type) : null;
      await putObject(bucket, key, part ? part.body : raw, part ? part.contentType : type);
      return json(res, 200, { Id: randomUUID(), Key: `${bucket}/${key}` });
    }

    if (method === 'GET') {
      const file = objectFile(bucket, key);
      if (!existsSync(file)) return json(res, 404, { error: 'NotFound' });
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': await objectContentType(bucket, key),
        'content-length': body.length,
        'access-control-allow-origin': '*',
      });
      return res.end(body);
    }

    if (method === 'DELETE') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const removed = [];
      for (const p of body.prefixes ?? []) {
        const file = objectFile(bucket, p);
        if (existsSync(file)) {
          await rm(file, { force: true });
          await rm(metaFile(bucket, p), { force: true });
          removed.push({ name: p });
        }
      }
      return json(res, 200, removed);
    }
  }

  return json(res, 404, { error: 'NotFound', route });
}

// ═══ Auth ══════════════════════════════════════════════════════

function adminUser() {
  return {
    id: ADMIN_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: ADMIN_EMAIL,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    phone: '',
    confirmed_at: '2026-01-01T00:00:00Z',
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  };
}

function session() {
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign({
    aud: 'authenticated',
    exp: now + 12 * HOUR,
    iat: now,
    iss: 'supabase-local',
    sub: ADMIN_ID,
    email: ADMIN_EMAIL,
    role: 'authenticated',
    session_id: randomUUID(),
  });
  return {
    access_token,
    token_type: 'bearer',
    expires_in: 12 * HOUR,
    expires_at: now + 12 * HOUR,
    refresh_token: sign({ sub: ADMIN_ID, typ: 'refresh', exp: now + 30 * 24 * HOUR }),
    user: adminUser(),
  };
}

async function handleAuth(req, res, url) {
  const route = url.pathname.replace('/auth/v1/', '');
  const method = req.method ?? 'GET';

  if (route === 'token' && method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');

    if (grant === 'refresh_token') return json(res, 200, session());

    if (body.email !== ADMIN_EMAIL || body.password !== ADMIN_PASSWORD) {
      return json(res, 400, {
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
        code: 'invalid_credentials',
        msg: 'Invalid login credentials',
      });
    }
    return json(res, 200, session());
  }

  if (route === 'user' && method === 'GET') {
    const header = req.headers.authorization ?? '';
    const claims = verify(header.replace(/^Bearer\s+/i, ''));
    if (!claims || claims.sub !== ADMIN_ID) {
      return json(res, 401, { code: 401, msg: 'invalid claim: missing sub claim' });
    }
    return json(res, 200, adminUser());
  }

  if (route === 'logout') return res.writeHead(204).end();

  if (route === 'settings') {
    return json(res, 200, { external: {}, disable_signup: true, mailer_autoconfirm: true });
  }

  return json(res, 404, { error: 'NotFound', route });
}

// ═══ PostgREST ═════════════════════════════════════════════════

async function handleRest(req, res, url) {
  const target = `${PGRST}${url.pathname.replace('/rest/v1', '')}${url.search}`;

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (['host', 'connection', 'content-length'].includes(key)) continue;
    headers[key] = value;
  }
  // apikey PostgREST не понимает, авторизация идёт по Bearer.
  delete headers.apikey;
  if (!headers.authorization) headers.authorization = `Bearer ${process.env.SHIM_ANON_KEY ?? ''}`;

  const body = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : await readBody(req);

  const upstream = await fetch(target, { method: req.method, headers, body });
  const payload = Buffer.from(await upstream.arrayBuffer());

  const out = {};
  upstream.headers.forEach((value, key) => {
    if (['content-encoding', 'transfer-encoding', 'connection'].includes(key)) return;
    out[key] = value;
  });
  out['content-length'] = payload.length;
  out['access-control-allow-origin'] = '*';

  res.writeHead(upstream.status, out);
  res.end(payload);
}

// ═══ Сервер ════════════════════════════════════════════════════

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': '*',
    });
    return res.end();
  }

  try {
    if (url.pathname.startsWith('/rest/v1')) return await handleRest(req, res, url);
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/storage/v1')) return await handleStorage(req, res, url);
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    return json(res, 404, { error: 'NotFound', path: url.pathname });
  } catch (error) {
    return json(res, 500, { error: 'ShimError', message: String(error?.message ?? error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(
    `supabase-shim: http://127.0.0.1:${PORT} → PostgREST ${PGRST}, storage ${ROOT}\n`,
  );
  process.stdout.write(`supabase-shim: jwt secret length ${JWT_SECRET.length}\n`);
});
