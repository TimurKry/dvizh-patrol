import { describe, expect, it } from 'vitest';
import { geminiErrorText } from '@/lib/ai/gemini';

/**
 * Разбор отказа Google.
 *
 * Причина, по которой это отдельная функция с тестом: первая
 * боевая отправка ушла на ручную проверку с кодом `ai_error`, и
 * восстановить, что именно ответил Google, было нечем. Теперь
 * текст попадает в админку — значит, он должен быть читаемым, а
 * не куском JSON.
 */
describe('geminiErrorText', () => {
  it('достаёт message из ответа Google', () => {
    const body = JSON.stringify({
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        status: 'INVALID_ARGUMENT',
      },
    });

    expect(geminiErrorText(body)).toBe('API key not valid. Please pass a valid API key.');
  });

  it('падает на status, если message не пришёл', () => {
    expect(geminiErrorText(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }))).toBe(
      'PERMISSION_DENIED',
    );
  });

  it('отдаёт тело как есть, если это не JSON', () => {
    expect(geminiErrorText('<html>502 Bad Gateway</html>')).toBe('<html>502 Bad Gateway</html>');
  });

  it('не молчит на пустом теле', () => {
    expect(geminiErrorText('')).toBe('пустой ответ');
  });

  it('обрезает длинный текст, чтобы влезть в last_error', () => {
    const long = JSON.stringify({ error: { message: 'x'.repeat(1000) } });
    expect(geminiErrorText(long)).toHaveLength(300);
  });
});
