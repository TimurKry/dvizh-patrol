import 'server-only';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Ограничение частоты запросов.
 *
 * Счётчики фиксированного окна лежат в Postgres. Для сорока
 * участников и одного вечера этого достаточно, а Redis добавил бы
 * ещё один сервис, который может упасть посреди мероприятия.
 *
 * Лимиты подобраны так, чтобы не мешать нормальной игре: команда
 * из четырёх человек, активно снимающая задания, в них не упрётся.
 */

export interface RateLimitRule {
  /** Длина окна в секундах. */
  windowSeconds: number;
  /** Сколько запросов допускается в окне. */
  max: number;
}

export const RATE_LIMITS = {
  /* Регистрация команды — редкое действие. */
  registerTeam: { windowSeconds: 600, max: 8 },
  /* Подбор кода должен быть невыгодным. */
  joinTeam: { windowSeconds: 600, max: 15 },
  /* Загрузка: 50 заданий за вечер, с запасом на пересъёмку. */
  createSubmission: { windowSeconds: 60, max: 20 },
  /* Повторная AI-проверка вручную. */
  retryValidation: { windowSeconds: 60, max: 30 },
  /* Вход администратора. */
  adminLogin: { windowSeconds: 900, max: 10 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitVerdict {
  allowed: boolean;
  hits: number;
  limit: number;
  resetAt: string | null;
}

/**
 * Адрес клиента.
 *
 * За обратным прокси (Vercel) берём первый адрес из
 * x-forwarded-for. Заголовок подделывается, поэтому лимит по IP —
 * защита от случайного шторма и грубого перебора, а не от
 * целенаправленной атаки. Настоящие гарантии дают уникальные
 * ограничения в базе.
 */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip') ?? 'unknown';
}

export async function checkRateLimit(
  name: RateLimitName,
  discriminator?: string,
): Promise<RateLimitVerdict> {
  const rule = RATE_LIMITS[name];
  const bucket = `${name}:${discriminator ?? (await clientKey())}`;

  const { data, error } = await supabaseAdmin().rpc('touch_rate_limit', {
    p_bucket: bucket,
    p_window_seconds: rule.windowSeconds,
    p_max_hits: rule.max,
  });

  if (error || !data) {
    // Сбой счётчика не должен останавливать мероприятие:
    // пропускаем запрос и полагаемся на проверки в базе.
    return { allowed: true, hits: 0, limit: rule.max, resetAt: null };
  }

  const verdict = data as { allowed: boolean; hits: number; limit: number; resetAt: string };
  return {
    allowed: verdict.allowed,
    hits: verdict.hits,
    limit: verdict.limit,
    resetAt: verdict.resetAt,
  };
}

/** Заголовок User-Agent — пишем в сессию для админского аудита. */
export async function currentUserAgent(): Promise<string | null> {
  const h = await headers();
  return h.get('user-agent')?.slice(0, 300) ?? null;
}
