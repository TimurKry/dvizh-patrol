/**
 * Ключи и токены локального стенда.
 *
 * Секрет и ключи здесь — общеизвестные значения из `supabase start`.
 * Они не дают доступа ни к чему, кроме контейнера с базой, которая
 * живёт ровно столько, сколько идёт запись, и в репозиторий не
 * попадает. Боевые ключи в этот каталог не кладутся никогда.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const JWT_SECRET =
  process.env.LOCAL_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (str) =>
  Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function sign(payload, secret = JWT_SECRET) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const mac = b64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${mac}`;
}

export function verify(token, secret = JWT_SECRET) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', secret).update(data).digest();
  const given = fromB64url(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(fromB64url(parts[1]).toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const YEAR = 60 * 60 * 24 * 365;
const issued = Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000);

export const ANON_KEY = sign({
  iss: 'supabase-local',
  role: 'anon',
  iat: issued,
  exp: issued + 10 * YEAR,
});

export const SERVICE_KEY = sign({
  iss: 'supabase-local',
  role: 'service_role',
  iat: issued,
  exp: issued + 10 * YEAR,
});
