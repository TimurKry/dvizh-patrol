import { describe, expect, it } from 'vitest';
import { hashToken, issueToken, signToken, verifyCookieValue } from '@/lib/session/token';

/**
 * Токены сессий.
 *
 * Проверяем ровно те свойства, на которых держится вход
 * участников без пароля.
 */

const SECRET = 'test-session-secret-at-least-32-characters-long';
const OTHER_SECRET = 'совершенно-другой-секрет-длиной-более-32-символов';

describe('выпуск токена', () => {
  it('выдаёт cookie и хэш', () => {
    const { cookieValue, tokenHash } = issueToken(SECRET);

    expect(cookieValue).toContain('.');
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('каждый раз выдаёт новый токен', () => {
    const first = issueToken(SECRET);
    const second = issueToken(SECRET);

    expect(first.cookieValue).not.toBe(second.cookieValue);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });

  it('сам токен в cookie не совпадает с тем, что уходит в базу', () => {
    const { cookieValue, tokenHash } = issueToken(SECRET);
    const token = cookieValue.slice(0, cookieValue.lastIndexOf('.'));

    // В базе только хэш: её утечка не даёт войти.
    expect(cookieValue).not.toContain(tokenHash);
    expect(hashToken(token)).toBe(tokenHash);
  });
});

describe('проверка cookie', () => {
  it('принимает собственное значение и возвращает тот же хэш', () => {
    const { cookieValue, tokenHash } = issueToken(SECRET);
    expect(verifyCookieValue(cookieValue, SECRET)).toBe(tokenHash);
  });

  it('отвергает значение, подписанное другим секретом', () => {
    const { cookieValue } = issueToken(OTHER_SECRET);
    expect(verifyCookieValue(cookieValue, SECRET)).toBeNull();
  });

  it('отвергает подменённый токен при валидной по форме подписи', () => {
    const { cookieValue } = issueToken(SECRET);
    const signature = cookieValue.slice(cookieValue.lastIndexOf('.') + 1);

    // Злоумышленник подставил свой токен, оставив чужую подпись.
    expect(verifyCookieValue(`подделка.${signature}`, SECRET)).toBeNull();
  });

  it('отвергает испорченную подпись', () => {
    const { cookieValue } = issueToken(SECRET);
    const separator = cookieValue.lastIndexOf('.');
    const token = cookieValue.slice(0, separator);

    expect(verifyCookieValue(`${token}.мусор`, SECRET)).toBeNull();
  });

  it('отвергает мусор без разделителя', () => {
    expect(verifyCookieValue('', SECRET)).toBeNull();
    expect(verifyCookieValue('простая-строка', SECRET)).toBeNull();
    expect(verifyCookieValue('.только-подпись', SECRET)).toBeNull();
  });

  it('в cookie нет идентификатора команды', () => {
    // Значение непрозрачно: подставить чужой team_id нельзя,
    // потому что его там просто нет.
    const { cookieValue } = issueToken(SECRET);
    expect(cookieValue).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe('подпись', () => {
  it('детерминирована', () => {
    expect(signToken('abc', SECRET)).toBe(signToken('abc', SECRET));
  });

  it('зависит от секрета', () => {
    expect(signToken('abc', SECRET)).not.toBe(signToken('abc', OTHER_SECRET));
  });
});
