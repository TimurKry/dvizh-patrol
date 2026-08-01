import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Токены командных сессий.
 *
 * Вынесено из team-session.ts, чтобы криптографию можно было
 * проверить тестами без Next.js: модуль сессий тянет cookies()
 * и помечен server-only.
 *
 * Устройство:
 *   cookie = <token>.<подпись>
 *   token   — 32 случайных байта в base64url;
 *   подпись — HMAC-SHA256(secret, token);
 *   в базе  — SHA-256(token).
 *
 * Подпись отсекает мусор до похода в базу. Хранение хэша означает,
 * что утечка таблицы сессий не даёт войти ни в одну команду.
 */

export interface IssuedToken {
  cookieValue: string;
  tokenHash: string;
}

export function signToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueToken(secret: string): IssuedToken {
  const token = randomBytes(32).toString('base64url');
  return {
    cookieValue: `${token}.${signToken(token, secret)}`,
    tokenHash: hashToken(token),
  };
}

/**
 * Проверяет подпись и возвращает хэш токена.
 * null означает, что значение подделано или испорчено.
 */
export function verifyCookieValue(value: string, secret: string): string | null {
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const token = value.slice(0, separator);
  const provided = value.slice(separator + 1);
  if (!provided) return null;

  const expected = signToken(token, secret);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Постоянное по времени сравнение: подпись подбирать по
  // таймингу не должно быть возможно.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return hashToken(token);
}
