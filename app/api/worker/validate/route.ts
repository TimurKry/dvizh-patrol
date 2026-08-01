import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { runValidationWorker } from '@/lib/ai/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Пачка из четырёх снимков с таймаутом 20 секунд укладывается
// с запасом; больше давать незачем — следующий проход подберёт
// остаток очереди.
export const maxDuration = 120;

/**
 * Обработчик очереди.
 *
 * Дёргается тремя способами:
 *  · автоматически после подтверждения отправки (after в confirm);
 *  · по расписанию Vercel Cron раз в минуту — подбирает то, что
 *    не успело обработаться, и зависшие задачи;
 *  · вручную из админки, кнопкой «Повторно обработать».
 *
 * Запрос без секрета отклоняется. Cron Vercel присылает свой
 * заголовок авторизации — он тоже принимается.
 */
function authorized(request: Request): boolean {
  const configured = env().WORKER_SECRET;

  // Cron Vercel: заголовок с CRON_SECRET, если он задан.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  if (!configured) {
    // Секрет не настроен — наружу эндпоинт не открываем.
    return false;
  }

  const provided =
    request.headers.get('x-worker-secret') ??
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 12) : undefined;

  const report = await runValidationWorker({ limit });

  return NextResponse.json({ ok: true, ...report });
}

/** Vercel Cron ходит методом GET. */
export async function GET(request: Request) {
  return POST(request);
}
